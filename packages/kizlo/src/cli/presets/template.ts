import fs from "node:fs"
import path from "node:path"
import z from "zod/v4"
import type { ResolvedPatch } from "./patch"
import { resolvePatchTargetPath } from "./patch"
import type { ScaffoldContext, ScaffoldFile } from "./types"

/**
 * The template's `template.json`. It is the single declaration of which files Kizlo lays onto a
 * project and how each is applied — the same engine drives both `create` (onto a fresh app the
 * framework CLI just bootstrapped) and `init` (onto the user's existing project). Every entry is one
 * of a small closed set — deliberately no "patch an arbitrary source file" kind, so a dangerous
 * strategy is unrepresentable:
 *
 * - `own` — a whole file Kizlo writes, adapted to the project's directories and written through the
 *   overwrite policy. `wiring`-scope files (the default) are laid down by both commands; `starter`
 *   demo files are laid down only by `create` (see {@link ownEntries}).
 * - `patch` — a partial injection into a file the framework owns (the root layout's SEO exports).
 *   Both commands try a confident apply, otherwise print the payload with placement instructions.
 */
const tokensSchema = z.object({
	/** Kizlo home directory in the template, e.g. `src/lib/kizlo`. */
	kizloDir: z.string(),
	/** App Router directory in the template, e.g. `src/app`. */
	appDir: z.string(),
	/** Import alias prefix the template's files use, e.g. `@`. */
	alias: z.string(),
})

const ownSchema = z.object({
	kind: z.literal("own"),
	role: z.string(),
	path: z.string(),
	/**
	 * What the file is for, which decides who writes it. `wiring` (the default) is Kizlo plumbing both
	 * `create` and `init` lay down. `starter` is demo content only `create` scaffolds onto a fresh app;
	 * `init` skips it so it never overwrites a file the user already owns (their home page, styles).
	 */
	scope: z.enum(["wiring", "starter"]).optional(),
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
	 * Flags passed to the initializer. Must produce a project whose shape matches {@link tokensSchema}
	 * (directory layout, import alias) so the wiring lands where the manifest expects. `{{pm}}` is
	 * substituted with the chosen package manager (e.g. `--use-{{pm}}`).
	 */
	flags: z.array(z.string()).default([]),
})

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
	tokens: tokensSchema,
	files: z.array(z.discriminatedUnion("kind", [ownSchema, patchSchema])),
})

export type TemplateManifest = z.infer<typeof manifestSchema>
export type TemplateTokens = z.infer<typeof tokensSchema>
export type TemplateBootstrap = z.infer<typeof bootstrapSchema>
export type OwnEntry = z.infer<typeof ownSchema>
export type PatchEntry = z.infer<typeof patchSchema>

/** Role → the human label init uses in prompts and logs. */
const ROLE_LABELS: Record<string, string> = {
	"server-entry": "Kizlo server instance",
	client: "Browser client",
	"api-route": "API route",
	robots: "robots.txt route",
	sitemap: "sitemap route",
	"sitemap-redirect": "sitemap.xml redirect route",
	manifest: "web manifest route",
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
 * The `own` files to scaffold. By default only `wiring` files (the Kizlo plumbing) — this is what
 * `init` lays onto an existing project, so it never touches the user's own pages. With
 * `includeStarter`, demo `starter` files are added too, which is what `create` lays onto a fresh app.
 */
export function ownEntries(manifest: TemplateManifest, opts: { includeStarter?: boolean } = {}): OwnEntry[] {
	return manifest.files.filter((file): file is OwnEntry => file.kind === "own" && (opts.includeStarter || file.scope !== "starter"))
}

export function patchEntries(manifest: TemplateManifest): PatchEntry[] {
	return manifest.files.filter((file): file is PatchEntry => file.kind === "patch")
}

/** The specifier the template's files use to reach the server entry, e.g. `@/lib/kizlo/server`. */
function serverImportSpecifier(tokens: TemplateTokens): string {
	const withoutSrc = tokens.kizloDir.replace(/^src\//, "")
	return `${tokens.alias.replace(/\/+$/, "")}/${withoutSrc}/server`
}

/**
 * Adapt a template path prefix (`src/app/...`, `src/lib/kizlo/...`) to the project's real directories.
 * Only the leading token dir is swapped; the rest of the path is preserved verbatim.
 */
function adaptTemplatePath(relPath: string, tokens: TemplateTokens, ctx: ScaffoldContext): string {
	const normalized = relPath.split(path.sep).join("/")
	if (normalized === tokens.appDir || normalized.startsWith(`${tokens.appDir}/`))
		return `${ctx.appDir}${normalized.slice(tokens.appDir.length)}`
	if (normalized === tokens.kizloDir || normalized.startsWith(`${tokens.kizloDir}/`))
		return `${ctx.kizloDir}${normalized.slice(tokens.kizloDir.length)}`
	return normalized
}

/**
 * Turn an `own` manifest entry into the {@link ScaffoldFile} init writes: read the template's real
 * file, rewrite its path prefix to the project's directories, and swap the server-entry import
 * specifier for the one resolved at the file's new location (tsconfig alias or relative). The swap is
 * surgical — it replaces the exact specifier the template uses, not a loose directory substring — so
 * an unrelated occurrence can't be corrupted. This is the job the old build-time extractor did; it
 * moves to runtime and stays as precise.
 */
export function adaptOwnFile(templateDir: string, entry: OwnEntry, tokens: TemplateTokens, ctx: ScaffoldContext): ScaffoldFile {
	const abs = path.join(templateDir, entry.path)
	if (!fs.existsSync(abs)) {
		throw new Error(`Template file "${entry.path}" is listed in the manifest but does not exist in the template.`)
	}
	const body = fs.readFileSync(abs, "utf8")
	const relPath = adaptTemplatePath(entry.path, tokens, ctx)
	const fromDir = path.posix.dirname(relPath)
	const contents = body.split(serverImportSpecifier(tokens)).join(ctx.serverImport(fromDir))
	return { label: ROLE_LABELS[entry.role] ?? entry.role, relPath, contents }
}

/** Substitute the path/import tokens for a patch against the project's real directories. */
export function resolvePatch(entry: PatchEntry, tokens: TemplateTokens, ctx: ScaffoldContext): ResolvedPatch {
	const relPath = adaptTemplatePath(entry.path, tokens, ctx)
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
