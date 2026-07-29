import fs from "node:fs"
import path from "node:path"
import z from "zod/v4"
import { type EnvKeys, getVersion, readTsconfigPaths } from "../utils"
import type { ResolvedPatch } from "./patch"
import type { ScaffoldContext, ScaffoldFile } from "./types"

/**
 * The template's `template.json`. It is the single declaration of what Kizlo lays onto a project and
 * how — the same engine drives both `create` (onto a fresh app the framework CLI just bootstrapped)
 * and `init` (onto the user's existing project). Changes are grouped into three sections by the one
 * question that decides whether a command may safely apply them — *where is this safe to land?* — and
 * no command ever reads another command's section:
 *
 * - `base` — safe on any project: additive, Kizlo-owned paths that never collide with the user's own
 *   files (the server entry, client, routes, and additive demo pages like a new blog route). Applied
 *   by both commands.
 * - `create` — safe only on a freshly bootstrapped app `create` may freely overwrite: the files the
 *   framework CLI already scaffolded, like the root layout (written whole, SEO-wired) and the homepage
 *   showcase. Applied only by `create`, never `init` — overwriting these on a real project would
 *   clobber the user's work.
 * - `init` — the non-destructive counterpart for the user's existing project: the root-layout SEO
 *   wiring lands here as a `patch` that merges into the layout the user already owns.
 *
 * Cutting across all three is the orthogonal `example` flag: opt-in demo content, applied only when the
 * user answers yes to "Add example pages?". A cross-cutting example (e.g. a blog) files each of its
 * pieces in the section that matches its safety — the additive new route in `base`, the homepage
 * showcase that overwrites an app-owned file in `create` — so `init` picks up only the additive half and
 * never touches a file the user owns, while `create` gets the whole demo. See {@link changesFor}.
 *
 * Each section is a list of changes, every one a member of a small closed set — deliberately no
 * "patch an arbitrary source file" kind, so a dangerous strategy is unrepresentable:
 *
 * - `file` — a whole file Kizlo writes, adapted to the project's directories and written through the
 *   overwrite policy.
 * - `patch` — a partial injection into a file the framework owns (the root layout's SEO exports):
 *   it adds or replaces individual modules (imports/exports) inside the file, never the whole file.
 *   Both commands try a confident apply, otherwise print the payload with placement instructions. A
 *   patch may instead set `mode: "note"` to always print its instructions rather than edit the file —
 *   for a change too shaped-unlike an import/export to auto-merge (Astro's `defineConfig` output/adapter).
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
	 * Opt-in demo content — a page the user can look at, not wiring they need. Applied only when the user
	 * answers yes to "Add example pages?"; core files omit this and are always written. Orthogonal to the
	 * section it sits in: the section still governs *where* the change is safe to land (see the section
	 * doc above), so an additive example lives in `base` and an app-owned overwrite lives in `create`.
	 */
	example: z.boolean().optional(),
})

const patchSchema = z.object({
	kind: z.literal("patch"),
	role: z.string(),
	label: z.string(),
	path: z.string(),
	/**
	 * How the patch is applied — the explicit author's choice between merging into the file and just
	 * telling the user what to change:
	 *
	 * - `apply` (default): merge the declared {@link patchSchema.shape.imports}/{@link patchSchema.shape.exports}
	 *   into the file with magicast, printing the payload as a fallback only when the target can't be found
	 *   or parsed. The existing behavior.
	 * - `note`: never touch the file — always print {@link patchSchema.shape.note} as a manual step. For a
	 *   change Kizlo can't safely auto-merge because it isn't an import/`export const` (e.g. Astro's
	 *   `defineConfig({ output, adapter })`, which lives inside the default-export call argument). Anchored
	 *   to a real target file + label, so the instruction reads against the file the user must edit.
	 */
	mode: z.enum(["apply", "note"]).default("apply"),
	imports: z.array(z.object({ module: z.string(), names: z.array(z.string()) })).default([]),
	exports: z.array(z.object({ name: z.string(), value: z.string() })).default([]),
	/** The manual-step body printed verbatim in `note` mode; ignored in `apply` mode. */
	note: z.string().optional(),
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

/**
 * The `.env` key names the scaffold writes and the pinned runtime later reads — the one part of the
 * wiring contract that can drift when the scaffold-time CLI and the pinned runtime disagree. Declared
 * here as data so the scaffold writes whatever names the pinned runtime expects. Semantic slots only;
 * the CLI still fills each value (generate a secret, provision Docker, prompt for a remote URL).
 */
const envSchema = z.object({
	/** Public Kizlo API URL key, e.g. `NEXT_PUBLIC_KIZLO_API_URL`. */
	baseUrl: z.string(),
	remote: z.object({ siteSecret: z.string(), wpUrl: z.string(), wpUsername: z.string(), wpPassword: z.string() }),
	local: z.object({ connect: z.string(), siteSecret: z.string(), wpUrl: z.string(), wpUsername: z.string(), wpPassword: z.string() }),
}) satisfies z.ZodType<EnvKeys>

/** A package name → version-range map, package.json's own vocabulary. */
const depsSchema = z.record(z.string(), z.string())

/**
 * The package names whose presence in a project's dependencies identify this framework — how `init`
 * recognizes which template to apply to an existing project (e.g. `["next"]`, `["astro"]`). Detection is
 * data, so a community template declares its own signal and needs no CLI change. See {@link detectTemplate}.
 */
const detectSchema = z.object({ dependencies: z.array(z.string()).default([]) })

/**
 * An `init` precondition on the project's shape: at least one of `anyDir` must exist in the project,
 * else `init` stops with `message`. Replaces framework-specific `if` branches — e.g. Next.js needs an
 * `app` or `src/app` directory (the App Router), which the Pages Router lacks. Dormant when absent.
 */
const requiresSchema = z.object({ anyDir: z.array(z.string()), message: z.string() })

/**
 * A post-setup manual step `init` prints after wiring — the piece Kizlo can't auto-wire into a file the
 * user owns (e.g. Astro's SEO tags render through a `.astro` component, not a patchable export). `create`
 * owns files whole, so it never prints these. `body` may carry one token, `{{importPrefix}}`, substituted
 * by {@link renderNote} with the project's source-root import prefix (an alias like `@/`, else `../`).
 */
const noteSchema = z.object({ title: z.string(), body: z.string() })

/** The command a set of changes is being applied for: the shared `base` plus this section. */
export type Command = "create" | "init"

const manifestSchema = z.object({
	framework: z.string(),
	/**
	 * Display label for template pickers and logs (e.g. `Next.js`). Optional — registry listing falls
	 * back to {@link manifestSchema.shape.framework} and then the template's directory name — so a
	 * community template that omits it still shows up, just under its folder id. See `listTemplates`.
	 */
	name: z.string().optional(),
	/**
	 * The `.env` key names a scaffolded project uses. Read by `managedEnv`/`writeEnv` so the scaffold
	 * writes the names the pinned runtime reads. Absent in-repo before the first stamped release;
	 * `create`/`init` fall back to the running CLI's {@link DEFAULT_ENV_KEYS}. See {@link EnvKeys}.
	 */
	env: envSchema.optional(),
	/**
	 * The dependencies a scaffolded project should pin, e.g. `{ "kizlo": "^0.8.2" }`. Stamped at release
	 * time from the monorepo's version (see `scripts/stamp-template-version.mjs`), so the template
	 * declares its own versions rather than resolving to the moving `latest` tag. Subsumes the old
	 * `kizloVersion` (it's just `dependencies.kizlo`). Absent in-repo before the first stamped release;
	 * `create`/`init` fall back to the running CLI's version. See {@link resolveDependencies}.
	 */
	dependencies: depsSchema.optional(),
	/** Dev-only dependencies, same stamping rules as {@link manifestSchema.shape.dependencies}. */
	devDependencies: depsSchema.optional(),
	/**
	 * The minimum `kizlo` CLI version that can correctly apply this manifest — the loud-failure backstop
	 * for a structural change an older scaffold-time CLI genuinely cannot handle. Dormant: absent means
	 * "satisfied", so it enforces nothing until a manifest change bumps it. See {@link minCliError}.
	 */
	minCli: z.string().optional(),
	/**
	 * The path the API handler mounts at (e.g. `/api/kizlo`), appended to the base URL so the client and
	 * route handler agree. Read generically by `create`/`init` — the CLI hardcodes no framework path.
	 * Absent on templates whose client resolves the backend URL itself. See {@link withApiPath}.
	 */
	apiPath: z.string().optional(),
	/** The dependency signal that identifies this framework for `init`'s detection. See {@link detectSchema}. */
	detect: detectSchema.optional(),
	/** An `init` precondition on the project's directory layout. See {@link requiresSchema}. */
	requires: requiresSchema.optional(),
	/** Manual steps `init` prints after wiring — what Kizlo can't auto-wire. See {@link noteSchema}. */
	notes: z.array(noteSchema).default([]),
	/**
	 * How `create` bootstraps the base app with the framework's own CLI. Absent on templates that only
	 * `init` supports; `create` refuses a template whose manifest declares no bootstrap.
	 */
	bootstrap: bootstrapSchema.optional(),
	/** The template's own directory layout and import alias, rewritten to the project's on apply. */
	conventions: conventionsSchema,
	/** Changes safe on any project — additive Kizlo-owned files, applied by both commands. */
	base: z.array(changeSchema).default([]),
	/** Changes safe only on a fresh app — overwrites of framework-scaffolded files (the whole layout). */
	create: z.array(changeSchema).default([]),
	/** Changes only `init` applies onto the user's project (the root-layout patch). */
	init: z.array(changeSchema).default([]),
})

export type TemplateManifest = z.infer<typeof manifestSchema>
export type TemplateConventions = z.infer<typeof conventionsSchema>
export type TemplateBootstrap = z.infer<typeof bootstrapSchema>
export type TemplateDetect = z.infer<typeof detectSchema>
export type TemplateRequires = z.infer<typeof requiresSchema>
export type TemplateNote = z.infer<typeof noteSchema>
export type FileEntry = z.infer<typeof fileSchema>
export type PatchEntry = z.infer<typeof patchSchema>
export type Change = z.infer<typeof changeSchema>

/**
 * Render a manual-step note for display, substituting the `{{importPrefix}}` token with the project's
 * source-root import prefix — the configured alias (normalized to a trailing slash, e.g. `@/`) when one
 * is set, else the relative `../`. Reproduces the old `alias ? "@/…" : "../…"` behavior exactly, so a
 * template's note reads correctly whichever import style the project uses.
 */
export function renderNote(note: TemplateNote, alias: string): { title: string; body: string } {
	const importPrefix = alias ? `${alias.replace(/\/+$/, "")}/` : "../"
	return { title: note.title, body: note.body.replaceAll("{{importPrefix}}", importPrefix) }
}

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
	"head-component": "SEO head component",
	"framework-config": "framework config",
	tsconfig: "TypeScript config",
	styles: "global styles",
}

/** Read and validate the template's manifest from a fetched template directory. */
export function readManifest(templateDir: string): TemplateManifest {
	const manifestPath = path.join(templateDir, "template.json")
	if (!fs.existsSync(manifestPath)) throw new Error(`Template manifest not found at ${manifestPath}`)
	return manifestSchema.parse(JSON.parse(fs.readFileSync(manifestPath, "utf8")))
}

/**
 * The dependencies a scaffolded project should pin, from the manifest. `kizlo` is always present —
 * every project needs it — so it falls back to the running CLI's version in-repo before the first
 * stamped release; any other declared package is taken verbatim (a template only lists packages it has
 * a version for). Framework packages release in lockstep with `kizlo`, so a stamped manifest carries
 * them all at the same released version.
 */
export function resolveDependencies(manifest: TemplateManifest): {
	dependencies: Record<string, string>
	devDependencies: Record<string, string>
} {
	return {
		dependencies: { kizlo: `^${getVersion()}`, ...manifest.dependencies },
		devDependencies: { ...manifest.devDependencies },
	}
}

/** A bare `x.y.z` from a version spec (range prefix and pre-release/build metadata dropped); undefined if none. */
function coerceVersion(spec: string): [number, number, number] | undefined {
	const match = /(\d+)\.(\d+)\.(\d+)/.exec(spec)
	return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined
}

/** Whether `have` is a strictly older release than `want`; false when either can't be compared. */
export function isOlderVersion(have: string, want: string): boolean {
	const a = coerceVersion(have)
	const b = coerceVersion(want)
	if (!a || !b) return false
	for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return (a[i] as number) < (b[i] as number)
	return false
}

/**
 * The loud-failure backstop: an error message when the running CLI is too old to apply this manifest,
 * or `undefined` when it's fine. Dormant by design — a manifest with no `minCli` never fails, so the
 * check is inert until a structural change bumps the floor. The first CLI-incompatible manifest change
 * sets `minCli`; from then on older CLIs (that already ship this check) stop with a clear message
 * instead of silently under-wiring the project.
 */
export function minCliError(manifest: TemplateManifest): string | undefined {
	if (!manifest.minCli) return undefined
	const running = getVersion()
	if (!isOlderVersion(running, manifest.minCli)) return undefined
	return `This template needs the kizlo CLI >= ${manifest.minCli} (you have ${running}). Run \`npx kizlo@latest\` and try again.`
}

/**
 * The changes a command applies: the shared `base` set plus the command's own section (`base` first, so
 * a later section can override it). Section placement is the *safety* axis — `base` is additive and safe
 * on any project, `create`/`init` carry the fresh-app-vs-existing-project halves — while the `example`
 * flag is the orthogonal *opt-in* axis. Example changes are dropped unless `includeExamples`, so the same
 * call serves both "core wiring only" and "plus the demo pages", and each command only ever sees its own
 * section: init's opt-in examples are the additive ones in `base`, never create's homepage overwrite.
 */
export function changesFor(manifest: TemplateManifest, command: Command, opts: { includeExamples?: boolean } = {}): Change[] {
	const changes = [...manifest.base, ...manifest[command]]
	return opts.includeExamples ? changes : changes.filter((change) => !isExample(change))
}

/** The whole-file changes in a resolved change list. */
export function fileEntries(changes: readonly Change[]): FileEntry[] {
	return changes.filter((change): change is FileEntry => change.kind === "file")
}

/** The partial-injection changes in a resolved change list. */
export function patchEntries(changes: readonly Change[]): PatchEntry[] {
	return changes.filter((change): change is PatchEntry => change.kind === "patch")
}

/** Whether a change is opt-in demo content — applied only when example pages are requested. */
export function isExample(change: Change): boolean {
	return change.kind === "file" && change.example === true
}

/** Escape a string so its characters are matched literally inside a RegExp. */
function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * The directory the template's alias resolves to — the maintainer's own preference, read straight from
 * the template's tsconfig `paths` (e.g. `@/* → ./src/*` yields `src`). This is the root stripped to turn
 * an alias import back into a real template path before it's remapped to the project. Falls back to the
 * `src`/root heuristic when the template declares no matching alias, staying consistent with the rest of
 * the alias handling.
 */
function templateAliasBase(templateDir: string, conventions: TemplateConventions): string {
	const alias = conventions.alias.replace(/\/+$/, "")
	const mapping = readTsconfigPaths(templateDir)?.[`${alias}/*`]?.[0]
	if (mapping) return mapping.replace(/^\.\//, "").replace(/\/\*$/, "").replace(/\/+$/, "")
	return conventions.kizloDir.startsWith("src/") ? "src" : ""
}

/**
 * Rewrite every template-alias import in a file to the project's chosen import style — the one place that
 * translates the maintainer's import preference into the user's. A template writes its cross-file imports
 * against its own alias (`@/layouts/Layout.astro`, `@/lib/kizlo/server`), rooted at the directory its
 * tsconfig maps the alias to (`base`). On apply each such specifier is resolved back to the imported
 * file's real location in the project (via {@link adaptTemplatePath}, so a relocated Kizlo dir is honored)
 * and re-emitted through the project's alias — or a relative import when the user wants no alias at all.
 * Only quoted specifiers that begin with the template alias are touched, so an unrelated string can't be
 * corrupted. Subsumes the server-entry import: it is simply the alias import that lands in the Kizlo dir.
 */
function rewriteAliasImports(body: string, fromDir: string, base: string, conventions: TemplateConventions, ctx: ScaffoldContext): string {
	const alias = conventions.alias.replace(/\/+$/, "")
	if (!alias) return body
	const pattern = new RegExp(`(["'])${escapeRegExp(alias)}/([^"']+)\\1`, "g")
	return body.replace(pattern, (_match, quote: string, rest: string) => {
		const targetRel = adaptTemplatePath(base ? `${base}/${rest}` : rest, conventions, ctx)
		return `${quote}${ctx.importFrom(targetRel, fromDir)}${quote}`
	})
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
 * file, rewrite its path prefix to the project's directories, and retarget every template-alias import
 * (the server entry plus any sibling like Astro's `@/layouts/Layout.astro`) to the specifier resolved
 * at the file's new location — the project's alias or a relative import. Only the exact alias specifiers
 * the template uses are rewritten, not a loose directory substring, so an unrelated occurrence can't be
 * corrupted. This is the job the old build-time extractor did; it moves to runtime and stays as precise.
 */
export function adaptFile(templateDir: string, entry: FileEntry, conventions: TemplateConventions, ctx: ScaffoldContext): ScaffoldFile {
	const abs = path.join(templateDir, entry.path)
	if (!fs.existsSync(abs)) {
		throw new Error(`Template file "${entry.path}" is listed in the manifest but does not exist in the template.`)
	}
	const body = fs.readFileSync(abs, "utf8")
	const relPath = adaptTemplatePath(entry.path, conventions, ctx)
	const fromDir = path.posix.dirname(relPath)
	const contents = rewriteAliasImports(body, fromDir, templateAliasBase(templateDir, conventions), conventions, ctx)
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
	return { label: entry.label, relPath, mode: entry.mode, imports, exports: entry.exports, note: entry.note }
}
