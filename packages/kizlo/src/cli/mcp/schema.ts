import type { IntrospectionDocument, IntrospectionOperationInput, IntrospectionSchema } from "../../wordpress/introspection"

export type JsonSchema = Record<string, unknown>

/** Where a converted definition is emitted, and the prefix a pointer to one carries. */
const DEFS = "$defs"

/**
 * Keywords that mean the same in both dialects and are copied straight across. The validation half
 * is what `SchemaCoercer` accepts on the WordPress side, so a bound the contract publishes reaches
 * the client that has to satisfy it instead of being dropped in translation.
 */
const COPIED = [
	"title",
	"description",
	"deprecated",
	"default",
	"enum",
	"format",
	"pattern",
	"minLength",
	"maxLength",
	"minItems",
	"maxItems",
	"minProperties",
	"maxProperties",
	"minimum",
	"maximum",
	"multipleOf",
	"uniqueItems",
	"exclusiveMinimum",
	"exclusiveMaximum",
] as const satisfies readonly (keyof IntrospectionSchema)[]

/**
 * One conversion. `defs` collects every `document.schemas` entry the result reaches, so a definition
 * is emitted once and pointed at from each place that uses it; `extending` guards the one kind of
 * reference that is still inlined.
 */
interface Run {
	document: IntrospectionDocument
	defs: Map<string, JsonSchema>
	extending: Set<string>
}

function run(document: IntrospectionDocument): Run {
	return { document, defs: new Map(), extending: new Set() }
}

/**
 * Turn an introspection schema into the JSON Schema an MCP client validates a tool call against.
 *
 * Three things separate the two dialects. Introspection marks a field required on the field itself,
 * where JSON Schema lists the names on the object holding them. `$ref` and `$extends` name entries in
 * `document.schemas` rather than being JSON pointers, so both are rewritten here: a `$ref` becomes a
 * pointer into `$defs`, and an `$extends` is flattened. And `file` is not a JSON Schema type; it
 * becomes the `string`/`binary` pair OpenAPI uses for the same thing.
 */
export function toJsonSchema(schema: IntrospectionSchema, document: IntrospectionDocument): JsonSchema {
	const current = run(document)
	return withDefs(convert(schema, current), current)
}

/**
 * The same, for an operation's request rather than one schema: each part it declares becomes a
 * property, so a caller validates and builds `{ params, query, body }` — the shape the request
 * builder takes. A part is required when the schema under it demands anything.
 *
 * The three parts share one run, so a definition two of them reach is emitted once at this root and
 * referenced from both rather than copied into each.
 */
export function inputJsonSchema(input: IntrospectionOperationInput, document: IntrospectionDocument): JsonSchema {
	const current = run(document)
	const properties: Record<string, JsonSchema> = {}
	const required: string[] = []

	for (const part of ["params", "query", "body"] as const) {
		const schema = input[part]
		if (!schema) continue
		properties[part] = convert(schema, current)
		// Read from the contract rather than the converted result: a part whose requirements arrive
		// through a `$ref` now carries a pointer, and its `required` list sits in `$defs`.
		const demands = schema.type === "object" ? demandsProperties(schema, document, new Set()) : schema.required !== false
		if (demands) required.push(part)
	}

	return withDefs({ type: "object", properties, ...(required.length > 0 ? { required } : {}) }, current)
}

/** Attach what the result reached, so the schema a client receives can be read without the document. */
function withDefs(schema: JsonSchema, current: Run): JsonSchema {
	if (current.defs.size === 0) return schema
	return { ...schema, [DEFS]: Object.fromEntries(current.defs) }
}

/** Whether an object schema demands anything, through the references that carry its properties. */
function demandsProperties(schema: IntrospectionSchema, document: IntrospectionDocument, seen: ReadonlySet<string>): boolean {
	if (Object.values(schema.properties ?? {}).some((child) => child.required)) return true

	for (const id of [...(schema.$ref ? [schema.$ref] : []), ...names(schema.$extends)]) {
		const target = document.schemas[id]
		if (!target || seen.has(id)) continue
		if (demandsProperties(target, document, new Set([...seen, id]))) return true
	}
	return false
}

/**
 * A schema is its own keywords laid over whatever it references, and the two kinds of reference are
 * rewritten differently. `$extends` is an overlay whose purpose is redeclaring an inherited property,
 * which a pointer cannot express, so its base is flattened and the schema's own keywords win.
 * `$ref` names the whole shape, so it stays a reference: one definition, pointed at from everywhere
 * that reaches it, which is what lets a schema describe its own recursion instead of being truncated.
 */
function convert(schema: IntrospectionSchema, current: Run): JsonSchema {
	let result = own(schema, current)

	for (const id of names(schema.$extends)) {
		result = merge(inline(id, current), result)
	}

	if (schema.$ref !== undefined) {
		const pointer = define(schema.$ref, current)
		// A reference the document does not define is left inlined as the empty schema, so the output
		// never points at a definition that is absent.
		if (pointer !== undefined) result = { ...result, $ref: pointer }
	}

	// After the references, because the type a reference resolves to is the one that has to accept null.
	return schema.nullable ? widenToNull(result) : result
}

/**
 * Let a converted schema accept `null`. A type takes it in place; a schema whose shape came from a
 * reference or a combinator has no type of its own to widen, so the union carries it instead.
 */
function widenToNull(schema: JsonSchema): JsonSchema {
	const type = schema.type
	if (typeof type === "string") return { ...schema, type: [type, "null"] }
	if (Array.isArray(type)) return type.includes("null") ? schema : { ...schema, type: [...type, "null"] }
	return { anyOf: [schema, { type: "null" }] }
}

/**
 * Ensure one `document.schemas` entry is defined, and answer with the pointer that addresses it.
 * Absent for a reference the document does not carry, which the caller leaves inlined.
 */
function define(id: string, current: Run): string | undefined {
	const target = current.document.schemas[id]
	if (!target) return undefined

	if (!current.defs.has(id)) {
		// Claimed before converting, so a definition that reaches itself finds the entry it is still
		// building and emits a pointer rather than recursing forever.
		current.defs.set(id, {})
		current.defs.set(id, convert(target, current))
	}

	return `#/${DEFS}/${escapePointer(id)}`
}

/** Resolve an `$extends` base for flattening, or the empty schema when it is absent or already open. */
function inline(id: string, current: Run): JsonSchema {
	const target = current.document.schemas[id]
	if (!target || current.extending.has(id)) return {}

	current.extending.add(id)
	try {
		return convert(target, current)
	} finally {
		current.extending.delete(id)
	}
}

/** RFC 6901 escaping, so an id carrying `~` or `/` still addresses the entry it named. */
function escapePointer(id: string): string {
	return id.replace(/~/g, "~0").replace(/\//g, "~1")
}

function names(value: string | string[] | undefined): string[] {
	if (value === undefined) return []
	return Array.isArray(value) ? value : [value]
}

/**
 * Lay `own` over `base`. Only the two keywords that describe an object's members combine: everything
 * else is a plain override, since a schema restating a `type` or a `description` means to replace it.
 */
function merge(base: JsonSchema, own: JsonSchema): JsonSchema {
	const result: JsonSchema = { ...base, ...own }

	const properties = { ...(base.properties as JsonSchema | undefined), ...(own.properties as JsonSchema | undefined) }
	if (Object.keys(properties).length > 0) result.properties = properties

	const required = [...new Set([...((base.required as string[]) ?? []), ...((own.required as string[]) ?? [])])]
	if (required.length > 0) result.required = required

	return result
}

/** The schema's own keywords, with the references it is built from left to {@link convert}. */
function own(schema: IntrospectionSchema, current: Run): JsonSchema {
	const result: JsonSchema = {}

	for (const keyword of COPIED) {
		const value = schema[keyword]
		if (value !== undefined) result[keyword] = value
	}

	// `file` has no JSON Schema type of its own, and it owns the format it lands on. `nullable` is not
	// handled here: it applies to whatever this schema finally resolves to, which {@link convert}
	// only knows once its references are in.
	if (schema.type === "file") {
		result.type = "string"
		result.format = "binary"
	} else if (schema.type) {
		result.type = schema.type
	}

	if (schema.properties) {
		const properties: JsonSchema = {}
		const required: string[] = []
		for (const [name, child] of Object.entries(schema.properties)) {
			properties[name] = convert(child, current)
			// The child says it is required; the object holding it is where JSON Schema records that.
			if (child.required) required.push(name)
		}
		result.properties = properties
		if (required.length > 0) result.required = required
	}

	if (schema.items) result.items = convert(schema.items, current)
	if (schema.anyOf) result.anyOf = schema.anyOf.map((member) => convert(member, current))
	if (schema.oneOf) result.oneOf = schema.oneOf.map((member) => convert(member, current))

	if (typeof schema.additionalProperties === "boolean") result.additionalProperties = schema.additionalProperties
	else if (schema.additionalProperties) result.additionalProperties = convert(schema.additionalProperties, current)

	if (schema.patternProperties) {
		result.patternProperties = Object.fromEntries(
			Object.entries(schema.patternProperties).map(([pattern, child]) => [pattern, convert(child, current)]),
		)
	}

	return result
}
