import MiniSearch from "minisearch"
import type { IntrospectionDocument, IntrospectionSchema } from "../../wordpress/introspection"
import { type McpRoute, routesOf, sortRoutes } from "./routes"

/**
 * How deep a schema is walked for searchable terms. Deep enough to reach the properties an agent
 * would name, shallow enough that a broad contract does not turn one search into a tree walk.
 */
const MAX_DEPTH = 6

/** Methods that only read, which is what the read/write filter divides the catalog on. */
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

/** Default page size, and the ceiling a caller may ask for. */
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

/**
 * How far below the best score in its tier a result may fall and still be returned.
 *
 * Terms are combined permissively, so one common token reaches an enormous number of routes: `post`
 * or `rest` alone selects most of a WordPress contract. Without a floor the tail of those matches is
 * counted as a match, and a caller told "504 of 504" learns nothing and has no reason to trust the
 * ranking. The floor is relative and applied within a tier, so it trims each tier's tail without
 * letting a strong identifier match suppress a weaker but differently-evidenced one.
 */
const SCORE_FLOOR = 0.25

/**
 * The indexed fields, and the evidence each one reports when it matches. Two fields answer to
 * `description` because a summary and a description are the same thing to someone reading a result.
 */
const EVIDENCE: Record<string, string> = {
	route: "route",
	path: "path",
	namespace: "namespace",
	summary: "description",
	description: "description",
	errors: "error",
	inputParams: "input.params.property",
	inputQuery: "input.query.property",
	inputBody: "input.body.property",
	responses: "response.property",
}

/**
 * Field weights. `settings` appears in dozens of route names and must count for almost nothing next
 * to a term that appears in two input schemas, which is what TF-IDF gives by construction; these
 * only express the tier preference on top of it.
 */
const BOOST: Record<string, number> = {
	route: 8,
	path: 6,
	namespace: 4,
	inputParams: 3,
	inputQuery: 3,
	inputBody: 3,
	errors: 3,
	summary: 2,
	description: 2,
	responses: 1,
}

interface Indexed {
	id: string
	route: string
	path: string
	namespace: string
	summary: string
	description: string
	errors: string
	inputParams: string
	inputQuery: string
	inputBody: string
	responses: string
}

/** Why a route is in the results: the named part of its contract, and the term that hit it. */
export interface SearchEvidence {
	field: string
	term: string
}

export interface SearchMatch {
	name: string
	namespace: string
	method: string
	path: string
	summary?: string
	deprecated?: true
	evidence: SearchEvidence[]
}

export interface SearchOptions {
	query?: string
	namespace?: string
	method?: string
	access?: "read" | "write"
	limit?: number
	cursor?: string
}

export interface SearchOutcome {
	/** Matches across the whole catalog, not just this page. */
	count: number
	routes: SearchMatch[]
	nextCursor?: string
	/** Every namespace this WordPress serves, so a filter that matched nothing can be corrected. */
	namespaces: string[]
}

/**
 * Rank the document's routes against a query.
 *
 * The index is built per call, because the watcher replaces the document whenever WordPress moves
 * and a cached index would answer for routes that no longer exist. Exact identifier matches are
 * found before the index is consulted, so looking a route up by name is deterministic rather than
 * something a scorer has to be trusted to get right.
 */
export function searchRoutes(document: IntrospectionDocument, options: SearchOptions = {}): SearchOutcome {
	const all = sortRoutes(routesOf(document).values())
	const namespaces = [...new Set(all.map((route) => route.namespace))].sort()
	const candidates = all.filter((route) => matchesFilters(route, options))

	const ranked = rank(candidates, document, (options.query ?? "").trim())

	const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
	const offset = decodeCursor(options.cursor)
	const next = offset + limit

	return {
		count: ranked.length,
		routes: ranked.slice(offset, next),
		...(next < ranked.length ? { nextCursor: encodeCursor(next) } : {}),
		namespaces,
	}
}

function matchesFilters(route: McpRoute, options: SearchOptions): boolean {
	if (options.namespace !== undefined && route.namespace !== options.namespace) return false
	if (options.method !== undefined && route.method !== options.method.toUpperCase()) return false
	if (options.access === "read" && !READ_METHODS.has(route.method)) return false
	if (options.access === "write" && READ_METHODS.has(route.method)) return false
	return true
}

/**
 * An empty query browses through the wildcard rather than around the index, so one path answers both
 * and a browse cannot drift from a search in ordering or shape.
 */
function rank(routes: McpRoute[], document: IntrospectionDocument, query: string): SearchMatch[] {
	const browsing = query === ""
	const index = new MiniSearch<Indexed>({ fields: Object.keys(BOOST), storeFields: ["id"] })
	index.addAll(routes.map((route) => indexed(route, document)))

	const byName = new Map(routes.map((route) => [route.name, route]))
	const merged = new Map<string, { tier: number; score: number; evidence: SearchEvidence[] }>()

	// Ahead of the index, so an identifier lookup answers with that route rather than whatever the
	// scorer liked best.
	const term = query.toLowerCase()
	if (!browsing) {
		for (const route of routes) {
			const evidence: SearchEvidence[] = []
			if (route.name.toLowerCase() === term) evidence.push({ field: "route", term: query })
			if (route.path.toLowerCase() === term) evidence.push({ field: "path", term: query })
			if (route.namespace.toLowerCase() === term) evidence.push({ field: "namespace", term: query })
			if (evidence.length > 0) merged.set(route.name, { tier: 0, score: Number.MAX_SAFE_INTEGER, evidence })
		}
	}

	const found = browsing ? index.search(MiniSearch.wildcard) : index.search(query, { prefix: true, fuzzy: 0.2, boost: BOOST })
	for (const result of found) {
		if (!browsing && result.score <= 0) continue
		const name = String(result.id)
		const evidence = evidenceOf(result.match)
		const already = merged.get(name)
		if (already) already.evidence = dedupe([...already.evidence, ...evidence])
		else merged.set(name, { tier: tierOf(evidence), score: result.score, evidence })
	}

	const entries = [...merged.entries()]
	const bestByTier = new Map<number, number>()
	for (const [, entry] of entries) {
		bestByTier.set(entry.tier, Math.max(bestByTier.get(entry.tier) ?? 0, entry.score))
	}

	// A browse is not a ranking, so every route stays in it.
	const kept = browsing ? entries : entries.filter(([, entry]) => entry.score >= (bestByTier.get(entry.tier) ?? 0) * SCORE_FLOOR)

	return kept
		.sort(([leftName, left], [rightName, right]) => {
			if (left.tier !== right.tier) return left.tier - right.tier
			if (left.score !== right.score) return right.score - left.score
			return leftName.localeCompare(rightName)
		})
		.flatMap(([name, entry]) => {
			const route = byName.get(name)
			return route ? [describe(route, entry.evidence)] : []
		})
}

/**
 * Which tier a hit belongs to, below the exact identifier matches that take tier 0.
 *
 * What a route takes as an argument comes first, because that is what someone searching for
 * `custom_fields` means. Response properties rank behind it, since generic words such as `title`,
 * `status`, and `date` otherwise select nearly every content route. A partial identifier or a word
 * from a summary ranks last: prefix matching means `custom` reaches every `customers` route, and
 * those must not crowd out the route that actually accepts the field.
 */
function tierOf(evidence: SearchEvidence[]): number {
	const fields = new Set(evidence.map((item) => item.field))
	if ([...fields].some((field) => field.startsWith("input.") || field === "error")) return 1
	if (fields.has("response.property")) return 2
	return 3
}

function evidenceOf(match: Record<string, string[]>): SearchEvidence[] {
	const evidence: SearchEvidence[] = []
	for (const [term, fields] of Object.entries(match)) {
		for (const field of fields) {
			const named = EVIDENCE[field]
			if (named) evidence.push({ field: named, term })
		}
	}
	return dedupe(evidence)
}

function dedupe(evidence: SearchEvidence[]): SearchEvidence[] {
	const seen = new Set<string>()
	return evidence.filter((item) => {
		const key = `${item.field} ${item.term}`
		if (seen.has(key)) return false
		seen.add(key)
		return true
	})
}

function describe(route: McpRoute, evidence: SearchEvidence[]): SearchMatch {
	return {
		name: route.name,
		namespace: route.namespace,
		method: route.method,
		path: route.path,
		...(route.summary !== undefined ? { summary: route.summary } : {}),
		...(route.deprecated ? { deprecated: true as const } : {}),
		evidence,
	}
}

function indexed(route: McpRoute, document: IntrospectionDocument): Indexed {
	const { input, responses, errors } = route.operation
	return {
		id: route.name,
		// Split on the separators, so `postTypes.book.list` is reachable by any of its segments.
		route: route.name.replace(/[.\-_]/g, " "),
		path: route.path.replace(/[/{}\-_]/g, " "),
		namespace: route.namespace,
		summary: route.summary ?? "",
		description: route.description ?? "",
		errors: errors.join(" "),
		inputParams: terms(input.params, document),
		inputQuery: terms(input.query, document),
		inputBody: terms(input.body, document),
		responses: Object.values(responses)
			.map((response) => `${terms(response.body, document)} ${terms(response.headers, document)}`)
			.join(" "),
	}
}

function terms(schema: IntrospectionSchema | undefined, document: IntrospectionDocument): string {
	return collect(schema, document, 0, new Set()).join(" ")
}

/**
 * Property names, titles, and descriptions reachable from a schema. Bounded by depth and guarded by
 * the ids already open on this branch, so a schema describing its own nesting cannot stall a search.
 */
function collect(
	schema: IntrospectionSchema | undefined,
	document: IntrospectionDocument,
	depth: number,
	seen: ReadonlySet<string>,
): string[] {
	if (!schema || depth > MAX_DEPTH) return []

	const found: string[] = []
	if (schema.title) found.push(schema.title)
	if (schema.description) found.push(schema.description)

	for (const [name, child] of Object.entries(schema.properties ?? {})) {
		found.push(name.replace(/[._-]/g, " "), ...collect(child, document, depth + 1, seen))
	}
	found.push(...collect(schema.items, document, depth + 1, seen))
	for (const member of [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])]) {
		found.push(...collect(member, document, depth + 1, seen))
	}
	if (typeof schema.additionalProperties === "object") {
		found.push(...collect(schema.additionalProperties, document, depth + 1, seen))
	}
	for (const child of Object.values(schema.patternProperties ?? {})) {
		found.push(...collect(child, document, depth + 1, seen))
	}

	for (const id of [...(schema.$ref ? [schema.$ref] : []), ...refs(schema.$extends)]) {
		if (seen.has(id)) continue
		found.push(...collect(document.schemas[id], document, depth + 1, new Set([...seen, id])))
	}

	return found
}

function refs(value: string | string[] | undefined): string[] {
	if (value === undefined) return []
	return Array.isArray(value) ? value : [value]
}

/** An opaque page marker, so a caller pages by handing one back rather than doing arithmetic. */
function encodeCursor(offset: number): string {
	return Buffer.from(`offset:${offset}`, "utf8").toString("base64url")
}

function decodeCursor(cursor: string | undefined): number {
	if (cursor === undefined) return 0
	const decoded = Buffer.from(cursor, "base64url").toString("utf8")
	const offset = Number.parseInt(decoded.replace(/^offset:/, ""), 10)
	return Number.isSafeInteger(offset) && offset >= 0 ? offset : 0
}
