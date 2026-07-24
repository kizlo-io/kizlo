import fs from "node:fs"
import path from "node:path"
import z from "zod/v4"
import type { ResolvedPatch } from "./patch"
import { resolvePatchTargetPath } from "./patch"
import type { ScaffoldContext, ScaffoldFile } from "./types"

/**
 * The template's `template.json`. It is the single declaration of what Kizlo lays onto a project and
 * how — the same engine drives both `create` (onto a fresh app the framework CLI just bootstrapped)
 * and `init` (onto the user's existing project). Changes are grouped into three sections so a command
 * only ever applies what is safe for it:
 *
 * - `base` — applied by both commands: the Kizlo plumbing (server entry, client, routes). Every
 *   change here must be safe on an existing project, so it is limited to files Kizlo owns, which
 *   never collide with the user's pages.
 * - `create` — applied only by `create`, onto a freshly bootstrapped app it may freely overwrite:
 *   the root layout (written whole, already SEO-wired) and its styles as core wiring, plus the demo
 *   pages flagged `example`, which are written only when the user asks for example pages.
 * - `init` — applied only by `init`, onto the user's existing project. The root-layout SEO wiring
 *   lands here as a `patch` so it merges into the layout the user already owns instead of replacing it.
 *
 * Each section is a list of changes, every one a member of a small closed set — deliberately no
 * "patch an arbitrary source file" kind, so a dangerous strategy is unrepresentable:
 *
 * - `file` — a whole file Kizlo writes, adapted to the project's directories and written through the
 *   overwrite policy.
 * - `patch` — a partial injection into a file the framework owns (the root layout's SEO exports):
 *   it adds or replaces individual modules (imports/exports) inside the file, never the whole file.
 *   Both commands try a confident apply, otherwise print the payload with placement instructions.
 */
const conventionsSchema = z.object({
	/** Kizlo home directory in the template, e.g. `src/lib/kizlo`. */
	kizloDir: z.string(),
	/** App Router directory in the template, e.g. `src/app`. */
	appDir: z.string(),
	/** Import alias prefix the template's files use, e.g. `@`. */
	alias: z.string(),
})

const fileSchema = z.object({
	kind: z.literal("file"),
	role: z.string(),
	path: z.string(),
	/**
	 * Opt-in demo content — a page the user can look at, not wiring they need. `create` writes it only
	 * when the user answers yes to "Add example pages?"; core files (the layout, its styles) omit this
	 * and are always written. Only meaningful in the `create` section, since examples are a fresh-app
	 * concept — laying a demo page onto an existing project would clobber the user's own.
	 */
	example: z.boolean().optional(),
})

const patchSchema = z.object({
	kind: z.literal("patch"),
	role: z.string(),
	label: z.string(),
	path: z.string(),
	imports: z.array(z.object({ module: z.string(), names: z.array(z.string()) })),
	exports: z.array(z.object({ name: z.string(), value: z.string() })),
})

const bootstrapSchema = z.object({
	/**
	 * The framework's official `create-*` initializer, e.g. `next-app@latest`. `create` runs it through
	 * the chosen package manager (`<pm> create <initializer> <name> …`); the CLI owns only the argv
	 * mechanics (the `create` verb, npm's `--` separator), so the template stays framework-authoritative.
	 */
	initializer: z.string(),
	/**
	 * Flags passed to the initializer. Must produce a project whose shape matches {@link conventionsSchema}
	 * (directory layout, import alias) so the wiring lands where the manifest expects. `{{pm}}` is
	 * substituted with the chosen package manager (e.g. `--use-{{pm}}`).
	 */
	flags: z.array(z.string()).default([]),
})

const changeSchema = z.discriminatedUnion("kind", [fileSchema, patchSchema])

/** The command a set of changes is being applied for: the shared `base` plus this section. */
export type Command = "create" | "init"

const manifestSchema = z.object({
	framework: z.string(),
	/**
	 * The `kizlo` dependency range a scaffolded project should pin, e.g. `^0.8.2`. Stamped at release
	 * time from the monorepo's kizlo version (see `scripts/stamp-template-version.mjs`), so the template
	 * declares its own version rather than resolving to the moving `latest` tag. Absent in-repo before
	 * the first stamped release; `create`/`init` fall back to the running CLI's version.
	 */
	kizloVersion: z.string().optional(),
	/**
	 * How `create` bootstraps the base app with the framework's own CLI. Absent on templates that only
	 * `init` supports; `create` refuses a template whose manifest declares no bootstrap.
	 */
	bootstrap: bootstrapSchema.optional(),
	/** The template's own directory layout and import alias, rewritten to the project's on apply. */
	conventions: conventionsSchema,
	/** Changes both commands apply: the Kizlo-owned plumbing files. */
	base: z.array(changeSchema).default([]),
	/** Changes only `create` applies onto a fresh app (the whole layout, demo pages, styles). */
	create: z.array(changeSchema).default([]),
	/** Changes only `init` applies onto the user's project (the root-layout patch). */
	init: z.array(changeSchema).default([]),
})

export type TemplateManifest = z.infer<typeof manifestSchema>
export type TemplateConventions = z.infer<typeof conventionsSchema>
export type TemplateBootstrap = z.infer<typeof bootstrapSchema>
export type FileEntry = z.infer<typeof fileSchema>
export type PatchEntry = z.infer<typeof patchSchema>
export type Change = z.infer<typeof changeSchema>

/** Role → the human label init uses in prompts and logs. */
const ROLE_LABELS: Record<string, string> = {
	"server-entry": "Kizlo server instance",
	client: "Browser client",
	"api-route": "API route",
	robots: "robots.txt route",
	sitemap: "sitemap route",
	"sitemap-redirect": "sitemap.xml redirect route",
	manifest: "web manifest route",
	"root-layout": "root layout",
	"home-page": "home page",
	"blog-post": "blog post page",
	styles: "global styles",
}

/** Read and validate the template's manifest from a fetched template directory. */
export function readManifest(templateDir: string): TemplateManifest {
	const manifestPath = path.join(templateDir, "template.json")
	if (!fs.existsSync(manifestPath)) throw new Error(`Template manifest not found at ${manifestPath}`)
	return manifestSchema.parse(JSON.parse(fs.readFileSync(manifestPath, "utf8")))
}

/**
 * The changes a command applies: the shared `base` set plus the command's own section. `create` gets
 * `base + create` (plumbing plus the demo pages); `init` gets `base + init` (plumbing plus any
 * init-only surgical patches). `base` is applied first so a later section can override it.
 */
export function changesFor(manifest: TemplateManifest, command: Command): Change[] {
	return [...manifest.base, ...manifest[command]]
}

/** The whole-file changes in a resolved change list. */
export function fileEntries(changes: readonly Change[]): FileEntry[] {
	return changes.filter((change): change is FileEntry => change.kind === "file")
}

/** The partial-injection changes in a resolved change list. */
export function patchEntries(changes: readonly Change[]): PatchEntry[] {
	return changes.filter((change): change is PatchEntry => change.kind === "patch")
}

/** Whether a change is opt-in demo content — written by `create` only when example pages are requested. */
export function isExample(change: Change): boolean {
	return change.kind === "file" && change.example === true
}

/** The specifier the template's files use to reach the server entry, e.g. `@/lib/kizlo/server`. */
function serverImportSpecifier(conventions: TemplateConventions): string {
	const withoutSrc = conventions.kizloDir.replace(/^src\//, "")
	return `${conventions.alias.replace(/\/+$/, "")}/${withoutSrc}/server`
}

/**
 * Adapt a template path prefix (`src/app/...`, `src/lib/kizlo/...`) to the project's real directories.
 * Only the leading convention dir is swapped; the rest of the path is preserved verbatim.
 */
function adaptTemplatePath(relPath: string, conventions: TemplateConventions, ctx: ScaffoldContext): string {
	const normalized = relPath.split(path.sep).join("/")
	if (normalized === conventions.appDir || normalized.startsWith(`${conventions.appDir}/`))
		return `${ctx.appDir}${normalized.slice(conventions.appDir.length)}`
	if (normalized === conventions.kizloDir || normalized.startsWith(`${conventions.kizloDir}/`))
		return `${ctx.kizloDir}${normalized.slice(conventions.kizloDir.length)}`
	return normalized
}

/**
 * Turn a `file` manifest entry into the {@link ScaffoldFile} init writes: read the template's real
 * file, rewrite its path prefix to the project's directories, and swap the server-entry import
 * specifier for the one resolved at the file's new location (tsconfig alias or relative). The swap is
 * surgical — it replaces the exact specifier the template uses, not a loose directory substring — so
 * an unrelated occurrence can't be corrupted. This is the job the old build-time extractor did; it
 * moves to runtime and stays as precise.
 */
export function adaptFile(templateDir: string, entry: FileEntry, conventions: TemplateConventions, ctx: ScaffoldContext): ScaffoldFile {
	const abs = path.join(templateDir, entry.path)
	if (!fs.existsSync(abs)) {
		throw new Error(`Template file "${entry.path}" is listed in the manifest but does not exist in the template.`)
	}
	const body = fs.readFileSync(abs, "utf8")
	const relPath = adaptTemplatePath(entry.path, conventions, ctx)
	const fromDir = path.posix.dirname(relPath)
	const contents = body.split(serverImportSpecifier(conventions)).join(ctx.serverImport(fromDir))
	return { label: ROLE_LABELS[entry.role] ?? entry.role, relPath, contents }
}

/** Adapt a patch's path prefix and server-import specifier to the project's real directories. */
export function resolvePatch(entry: PatchEntry, conventions: TemplateConventions, ctx: ScaffoldContext): ResolvedPatch {
	const relPath = adaptTemplatePath(entry.path, conventions, ctx)
	const fromDir = path.posix.dirname(relPath)
	const imports = entry.imports.map((imp) => ({
		module: imp.module.replaceAll("{{serverImport}}", ctx.serverImport(fromDir)),
		names: imp.names,
	}))
	return { label: entry.label, relPath, imports, exports: entry.exports }
}

const LAYOUT_FILE = /^layout\.(tsx|jsx|ts|js|mjs|cjs)$/
/** A root layout is the one that renders `<html>` — its identity, not its path. */
const RENDERS_HTML = /<html[\s/>]/

/** Every file under `dir`, recursively (files only). Missing dir yields nothing. */
function walk(dir: string): string[] {
	if (!fs.existsSync(dir)) return []
	const out: string[] = []
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) out.push(...walk(full))
		else out.push(full)
	}
	return out
}

/**
 * Resolve the root layout by identity, not path. Try the manifest hint first; if it exists and
 * renders `<html>`, use it. Otherwise scan the App Router directory for a layout that renders `<html>`
 * and use it only when there is exactly one. On zero, many, or an unreadable file, return undefined so
 * the caller prints the wiring for the user to place. Never guesses.
 */
export function findRootLayout(cwd: string, appDir: string, hintRelPath: string): string | undefined {
	const hint = resolvePatchTargetPath(cwd, hintRelPath)
	if (hint && rendersHtml(hint)) return hint

	const matches = walk(path.join(cwd, appDir)).filter((file) => LAYOUT_FILE.test(path.basename(file)) && rendersHtml(file))
	return matches.length === 1 ? matches[0] : undefined
}

function rendersHtml(file: string): boolean {
	try {
		return RENDERS_HTML.test(fs.readFileSync(file, "utf8"))
	} catch {
		return false
	}
}
