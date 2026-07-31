import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { downloadTemplate } from "giget"

/** The default registry: the templates workspace on the repo's default branch. */
export const DEFAULT_REGISTRY = "github:kizlo-io/kizlo/templates"

/**
 * A template registry — where Kizlo discovers templates. Kizlo never hardcodes the template names: it
 * scans the registry for whatever it contains (see {@link listTemplates}). A registry is either a
 * directory of templates (one subdirectory per template, each with its own `template.json`) or a single
 * template shipped on its own (a directory whose `template.json` is at the root). Both are the escape
 * hatch — point `--source` at any local path or giget source and the community can ship its own
 * registries or standalone templates without a CLI change.
 *
 * Resolution: an explicit `--source` value wins, otherwise the default GitHub templates dir. A
 * `--source` value that resolves to an existing directory on disk is treated as a local registry (so
 * local development points at the repo's own `templates/` with `--source ./templates`); anything else
 * is a giget source string (e.g. `github:owner/repo/path`) that gets downloaded.
 */
export interface Registry {
	/** True when the registry is a local directory (read as-is); false when it's a remote source to download. */
	local: boolean
	/** The local directory path or the giget source string. */
	source: string
}

export function resolveRegistry(registryArg?: string): Registry {
	if (!registryArg) return { local: false, source: DEFAULT_REGISTRY }
	const abs = path.resolve(registryArg)
	if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) return { local: true, source: abs }
	return { local: false, source: registryArg }
}

export interface FetchedRegistry {
	/** A readable directory holding every template subdirectory (the local dir, or a downloaded temp copy). */
	dir: string
	/** Remove the temp copy when done. A no-op for a local directory — never delete the user's source. */
	cleanup: () => void
}

/**
 * Get a registry as a readable directory both commands can scan and copy from. A local registry is
 * returned as-is (cleanup is a no-op); a remote one is downloaded once into a fresh temp directory the
 * caller cleans up. The whole registry is fetched in one shot so listing and applying share the same
 * bytes and never re-download per template.
 */
export async function fetchRegistry(registry: Registry): Promise<FetchedRegistry> {
	if (registry.local) {
		if (!fs.existsSync(registry.source)) throw new Error(`Registry directory not found: ${registry.source}`)
		return { dir: registry.source, cleanup: () => {} }
	}
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-registry-"))
	await downloadTemplate(registry.source, { dir, forceClean: true })
	return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) }
}

export interface TemplateEntry {
	/** Template id — its subdirectory name in the registry, and the value `create` accepts as an argument. */
	id: string
	/** Human label for prompts and logs — the manifest's `name`, falling back to its `id`, then the directory id. */
	label: string
	/** Absolute path to the template's directory inside the fetched registry. */
	dir: string
}

/** The display fields from a raw `template.json`, read leniently so one bad manifest can't break discovery. */
function readMeta(manifestPath: string): { name?: string; id?: string } {
	try {
		const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { name?: unknown; id?: unknown }
		return {
			name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : undefined,
			id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : undefined,
		}
	} catch {
		// Full schema validation happens when the template is actually applied (`readManifest`).
		return {}
	}
}

/**
 * Every template a fetched registry contains. A registry can be either shape, and both "just work":
 *
 * - A collection: a directory of templates, each an immediate subdirectory with its own `template.json`
 *   (Kizlo's own `templates/` dir, or a community registry of several). The subdirectory name is the
 *   template's addressable id. A subdirectory without a manifest is skipped so an unrelated folder can't
 *   break the listing.
 * - A single template: a directory that is itself a template (`template.json` at its root) — the escape
 *   hatch for a community template shipped on its own, e.g. `--source github:acme/kizlo-astro-template`.
 *   Its id comes from the manifest's `id` (a stable name that also matches what `init`'s detected
 *   preset asks for), not the directory name, which for a downloaded repo is a random temp folder.
 *
 * Discovery is by scanning, not a hardcoded list, and the manifest is read only for its display fields
 * here. Sorted by id for a stable prompt order.
 */
/**
 * True when the fetched source is itself a single template (a `template.json` at its root) rather than a
 * registry of many. `init` uses this to tell the two `--source` shapes apart: a single template is an
 * explicit, deliberate choice (applied even against detection, with a warning), whereas a registry is
 * filtered down to the templates whose framework the project matches.
 */
export function isSingleTemplate(registryDir: string): boolean {
	return fs.existsSync(path.join(registryDir, "template.json"))
}

export function listTemplates(registryDir: string): TemplateEntry[] {
	if (!fs.existsSync(registryDir)) return []

	if (isSingleTemplate(registryDir)) {
		const rootManifest = path.join(registryDir, "template.json")
		const meta = readMeta(rootManifest)
		const id = meta.id ?? path.basename(registryDir)
		return [{ id, label: meta.name ?? meta.id ?? id, dir: registryDir }]
	}

	const entries: TemplateEntry[] = []
	for (const dirent of fs.readdirSync(registryDir, { withFileTypes: true })) {
		if (!dirent.isDirectory()) continue
		const dir = path.join(registryDir, dirent.name)
		const manifestPath = path.join(dir, "template.json")
		if (!fs.existsSync(manifestPath)) continue
		const meta = readMeta(manifestPath)
		entries.push({ id: dirent.name, label: meta.name ?? meta.id ?? dirent.name, dir })
	}
	return entries.sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * A template's detection package list — the `values` of every `dep` requirement under `init.requires`,
 * read leniently (raw JSON, no schema) so one malformed manifest can't break detection for the rest of a
 * registry. Full schema validation happens when the template is actually applied (`readManifest`).
 */
function readDetectDeps(templateDir: string): string[] {
	try {
		const raw = JSON.parse(fs.readFileSync(path.join(templateDir, "template.json"), "utf8")) as {
			init?: { requires?: Array<{ kind?: unknown; values?: unknown }> }
		}
		const requires = raw.init?.requires
		if (!Array.isArray(requires)) return []
		return requires
			.filter((req) => req?.kind === "dep" && Array.isArray(req.values))
			.flatMap((req) => req.values as unknown[])
			.filter((name): name is string => typeof name === "string")
	} catch {
		return []
	}
}

/**
 * The templates whose framework a project is built with, best match(es) first, or an empty array when
 * none matches (use the base fallback). Detection is data: each template's manifest declares the
 * `detect.dependencies` whose presence in the project's deps identify its framework, and this scores
 * every entry by how many of its declared deps the project has, returning every entry that ties for the
 * top score. One match is the common one-per-framework registry; more than one means the registry ships
 * same-framework variants that dependency presence alone can't disambiguate, and the caller decides
 * (prompt, or force with `--template`). Ties preserve the entries' incoming order (id-sorted from
 * {@link listTemplates}). Read leniently — a malformed manifest scores zero rather than throwing — so one
 * bad template in a registry can't break detection for the rest.
 */
export function detectTemplates(entries: TemplateEntry[], deps: Record<string, string>): TemplateEntry[] {
	let bestScore = 0
	let best: TemplateEntry[] = []
	for (const entry of entries) {
		const score = readDetectDeps(entry.dir).filter((name) => name in deps).length
		if (score === 0) continue
		if (score > bestScore) {
			bestScore = score
			best = [entry]
		} else if (score === bestScore) {
			best.push(entry)
		}
	}
	return best
}

/**
 * Resolve a single template's directory inside a fetched registry, erroring when the registry has no
 * such template (so a typo or a registry that doesn't ship the framework a preset detected fails loudly
 * with the ids it does have).
 */
export function locateTemplate(registryDir: string, id: string): string {
	const match = listTemplates(registryDir).find((entry) => entry.id === id)
	if (!match) {
		const available = listTemplates(registryDir)
			.map((entry) => entry.id)
			.join(", ")
		throw new Error(`Template "${id}" not found in the registry.${available ? ` Available: ${available}` : ""}`)
	}
	return match.dir
}

export interface FetchedTemplate {
	/** A readable directory holding the template's files (a subdir of the local registry, or of a temp copy). */
	dir: string
	/** Remove the temp copy when done. A no-op for a local registry — never delete the user's source. */
	cleanup: () => void
}

/**
 * Get a single template as a readable directory, resolved from its registry. Fetches the registry
 * (local or downloaded), then locates the template subdirectory by id. The returned `cleanup` removes
 * the whole downloaded registry, so `init` — which already knows the template id from the detected
 * preset — can fetch and clean up in one call. `create`, which must list before it knows the id, uses
 * {@link fetchRegistry} + {@link listTemplates} directly.
 */
export async function fetchTemplate(id: string, registry: Registry): Promise<FetchedTemplate> {
	const fetched = await fetchRegistry(registry)
	try {
		return { dir: locateTemplate(fetched.dir, id), cleanup: fetched.cleanup }
	} catch (error) {
		fetched.cleanup()
		throw error
	}
}
