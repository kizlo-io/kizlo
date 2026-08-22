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
/**
 * The template's wiring config — how Kizlo addresses the files it lays down, rewritten to the project's
 * own layout on apply (used by both `create` and `init`, unlike the init-only preconditions). The
 * template writes its files against its own {@link configSchema.shape.kizloPath} and
 * {@link configSchema.shape.alias}; on apply the Kizlo dir is retargeted to the project's chosen location,
 * every alias import to the project's import style, and every other `src/`-rooted path to the project's
 * `src/` convention (kept when the project uses `src/`, stripped when it doesn't).
 */
const configSchema = z.object({
	/**
	 * The path the API handler mounts at (e.g. `/api/kizlo`), appended to the base URL so the client and
	 * route handler agree. Read generically by `create`/`init` — the CLI hardcodes no framework path.
	 * Absent on templates whose client resolves the backend URL itself. See {@link withApiPath}.
	 */
	apiPath: z.string().optional(),
	/**
	 * Import alias prefix the template's files are written against, e.g. `@` (empty rewrites cross-file
	 * imports to relative). Two jobs: the authoring convention {@link rewriteAliasImports} matches on to
	 * find those imports, and a *preference* for the output. It is not a guarantee the scaffolded project
	 * declares it — the bootstrapping CLI owns tsconfig — so `create` checks it against the real `paths`
	 * and falls back to relative imports when nothing backs it up.
	 */
	alias: z.string(),
	/** Kizlo home directory in the template, e.g. `src/lib/kizlo`; retargeted to the user's chosen Kizlo dir on apply. */
	kizloPath: z.string(),
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

/**
 * The `command` half of {@link createSchema}: the full invocation that scaffolds the base app with the
 * framework's own CLI, written exactly as it would be typed — e.g. `{{pm}} create next-app@latest {{name}}
 * --ts …`. The CLI imposes no shape: it tokenizes the string, substitutes the tokens below, and runs the
 * argv verbatim, so a template can use any invocation (a `create-*` initializer, `{{pm}} dlx <cli> create`,
 * a subcommand after the package spec) without the CLI knowing anything framework-specific. The template is
 * fully authoritative, which means it also owns any package-manager quirks (npm's `--` separator, yarn's
 * `@latest` handling).
 *
 * The core tokens substituted before the command runs:
 * - `{{pm}}` — the chosen package manager (`pnpm`/`npm`/`yarn`/`bun`).
 * - `{{name}}` — the project name (or path) the user gave.
 * - `{{dlx}}` — the manager's run-a-package command (`pnpm dlx`/`npx`/`yarn dlx`/`bunx`), for a CLI that
 *   isn't a `create-*` package (e.g. `{{dlx}} @tanstack/cli@latest create {{name}}`); a `create-*`
 *   package invokes more simply as `{{pm}} create <initializer> {{name}}`.
 *
 * Beyond those, a `{{<token>}}` for every prompt in the same `create` block (see {@link promptSchema}) is
 * substituted with the CLI fragment the user's answer maps to — the mechanism that lets a template
 * surface a real framework choice (which linter, turbopack on/off) instead of hard-coding the flag.
 * A fragment may be empty (contributes nothing) or several flags; each is spliced in as plain text and
 * re-tokenized, so the CLI still learns nothing framework-specific.
 *
 * The command must produce a project whose shape matches {@link configSchema} (directory layout,
 * import alias) so the wiring lands where the manifest expects. Simple single/double quotes group a
 * token that contains spaces; there is no shell expansion.
 */
const commandSchema = z.string()

/**
 * A prompt the template asks during `create`, its answer mapped to a fragment of the {@link commandSchema}
 * command via the prompt's `{{token}}`. This is how a template exposes a framework CLI choice it would
 * otherwise have to hard-code (which linter, turbopack on/off, a custom import alias) without the Kizlo
 * CLI knowing anything framework-specific: the manifest owns both the question and the flag it produces.
 *
 * Three shapes, discriminated on `kind`:
 * - `select` — a single choice from {@link promptOptionSchema} options; the chosen option's `arg` is the
 *   fragment. `default` names the option value pre-selected (and used non-interactively); absent → the
 *   first option.
 * - `confirm` — a yes/no; `arg` is the fragment when yes, `argFalse` when no. `default` is the answer used
 *   non-interactively.
 * - `text` — free input spliced into `arg` at its `{{value}}` placeholder; the value is shell-quoted so it
 *   stays a single argv token. Empty input quotes to nothing, so with the default `{{value}}` arg it
 *   contributes nothing (a wrapping arg like `--flag {{value}}` still emits the flag). `default` is the
 *   value used non-interactively.
 *
 * Every prompt owns a unique `token` that must not shadow a core token (`pm`/`name`/`dlx`); the bootstrap
 * schema rejects collisions and duplicates.
 */
const promptOptionSchema = z.object({
	/** The label shown in the picker and echoed in the choices summary. */
	label: z.string(),
	/** Stable id for this option — names the `default` and is the value carried into resolution. */
	value: z.string(),
	/** The CLI fragment this choice contributes to the bootstrap command; empty contributes nothing. */
	arg: z.string().default(""),
})

const selectPromptSchema = z.object({
	kind: z.literal("select"),
	token: z.string(),
	message: z.string(),
	/** The pre-selected option `value`; falls back to the first option when absent. */
	default: z.string().optional(),
	options: z.array(promptOptionSchema).min(1),
})

const confirmPromptSchema = z.object({
	kind: z.literal("confirm"),
	token: z.string(),
	message: z.string(),
	default: z.boolean().default(true),
	/** Fragment when the answer is yes. */
	arg: z.string().default(""),
	/** Fragment when the answer is no. */
	argFalse: z.string().default(""),
})

const textPromptSchema = z.object({
	kind: z.literal("text"),
	token: z.string(),
	message: z.string(),
	placeholder: z.string().optional(),
	default: z.string().optional(),
	/** Fragment template; `{{value}}` is replaced by the shell-quoted input. */
	arg: z.string().default("{{value}}"),
})

const promptSchema = z.discriminatedUnion("kind", [selectPromptSchema, confirmPromptSchema, textPromptSchema])

/** The core bootstrap tokens a prompt token must never shadow. */
const RESERVED_TOKENS = new Set(["pm", "name", "dlx"])

/**
 * How `create` scaffolds the base app: the framework CLI `command` to run, plus the `prompts` whose answers
 * fill its `{{token}}` placeholders — kept together because a prompt is meaningless without the command it
 * customizes. Absent on templates that only `init` supports; `create` refuses a template whose manifest
 * declares no `create` block. A `superRefine` rejects a prompt `token` that shadows a core token
 * (`pm`/`name`/`dlx`) or repeats another prompt's, so a mis-authored manifest fails loudly at parse time.
 */
const createSchema = z
	.object({
		/** The framework CLI invocation, with `{{pm}}`/`{{name}}`/`{{dlx}}` and per-prompt tokens. See {@link commandSchema}. */
		command: commandSchema,
		/** Prompts asked before the command runs, each answer spliced into `command` via its `{{token}}`. See {@link promptSchema}. */
		prompts: z.array(promptSchema).default([]),
	})
	.superRefine((create, ctx) => {
		const seen = new Set<string>()
		for (const prompt of create.prompts) {
			if (RESERVED_TOKENS.has(prompt.token))
				ctx.addIssue({ code: "custom", message: `Prompt token "${prompt.token}" is reserved (pm/name/dlx).`, path: ["prompts"] })
			if (seen.has(prompt.token)) ctx.addIssue({ code: "custom", message: `Duplicate prompt token "${prompt.token}".`, path: ["prompts"] })
			seen.add(prompt.token)
		}
	})

const changeSchema = z.discriminatedUnion("kind", [fileSchema, patchSchema])

/**
 * The changes a template lays down, split by the one question that decides whether a command may safely
 * apply them — *where is this safe to land?* No command reads another's section: `base` is additive and
 * safe on any project (both commands apply it), `create` overwrites framework-scaffolded files (only
 * `create`), `init` patches files the user owns (only `init`). See the section doc above and {@link changesFor}.
 */
const changesSchema = z.object({
	/** Changes safe on any project — additive Kizlo-owned files, applied by both commands. */
	base: z.array(changeSchema).default([]),
	/** Changes safe only on a fresh app — overwrites of framework-scaffolded files (the whole layout). */
	create: z.array(changeSchema).default([]),
	/** Changes only `init` applies onto the user's project (the root-layout patch). */
	init: z.array(changeSchema).default([]),
})

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
 * A post-setup manual step `init` prints after wiring — the piece Kizlo can't auto-wire into a file the
 * user owns (e.g. Astro's SEO tags render through a `.astro` component, not a patchable export). `create`
 * owns files whole, so it never prints these. `body` may carry one token, `{{importPrefix}}`, substituted
 * by {@link renderNote} with the project's source-root import prefix (an alias like `@/`, else `../`).
 */
const noteSchema = z.object({ title: z.string(), body: z.string() })

/**
 * A single precondition `init` checks against the project before applying — data in place of the old
 * framework-specific `if` branches, so a community template declares its own without a CLI change.
 * Discriminated on `kind`:
 *
 * - `dep` — package(s) in the project's dependencies. Doubles as the framework *detection* signal (see
 *   {@link detectTemplates}): a template's match score is how many of its `dep` `values` the project has,
 *   read across every candidate template before one is chosen.
 * - `dir` — director(ies) in the project tree, e.g. Next's `app`/`src/app` App Router (the Pages Router
 *   lacks it).
 *
 * `match` decides whether `any` (default) or `all` of `values` must be present; `message` is the abort
 * text shown when the requirement is unmet, defaulting to `""` → a generated fallback. See {@link unmetRequirement}.
 */
const requiresFields = {
	/** The packages (`dep`) or directories (`dir`) this requirement is about; at least one. */
	values: z.array(z.string()).min(1),
	/** Whether `any` (default) or `all` of `values` must be present for the requirement to be satisfied. */
	match: z.enum(["any", "all"]).default("any"),
	/** Abort message when unmet; `""` (default) yields a generated fallback. */
	message: z.string().default(""),
}
const requiresDepSchema = z.object({ kind: z.literal("dep"), ...requiresFields })
const requiresDirSchema = z.object({ kind: z.literal("dir"), ...requiresFields })
const requirementSchema = z.discriminatedUnion("kind", [requiresDepSchema, requiresDirSchema])

/** Everything the `init` command needs of the project: the preconditions it checks and the steps it prints. */
const initSchema = z.object({
	/** Preconditions `init` checks before applying; `dep` entries also drive detection. See {@link requirementSchema}. */
	requires: z.array(requirementSchema).default([]),
	/** Manual steps `init` prints after wiring — what Kizlo can't auto-wire. See {@link noteSchema}. */
	notes: z.array(noteSchema).default([]),
})

/** The command a set of changes is being applied for: the shared `base` plus this section. */
export type Command = "create" | "init"

const manifestSchema = z.object({
	/**
	 * The template's stable id — a name like `nextjs` that also matches what `init`'s detected preset asks
	 * for. Used as the addressable id when the source is a single template, and as the label fallback. For
	 * a registry of many, the subdirectory name is the addressable id and this is display-only.
	 */
	id: z.string(),
	/**
	 * Display label for template pickers and logs (e.g. `Next.js`). Optional — registry listing falls
	 * back to {@link manifestSchema.shape.id} and then the template's directory name — so a
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
	/** The template's wiring config — API mount path, import alias, and directory layout. See {@link configSchema}. */
	config: configSchema,
	/** Everything the `init` command needs of the project — preconditions and manual steps. See {@link initSchema}. */
	init: initSchema.default({ requires: [], notes: [] }),
	/**
	 * How `create` bootstraps the base app — the framework CLI command plus its prompts. Absent on templates
	 * that only `init` supports; `create` refuses a template whose manifest declares no `create` block. See
	 * {@link createSchema}.
	 */
	create: createSchema.optional(),
	/** The files Kizlo lays down, split by where each is safe to land. See {@link changesSchema}. */
	changes: changesSchema.default({ base: [], create: [], init: [] }),
})

export type TemplateManifest = z.infer<typeof manifestSchema>
export type TemplateConfig = z.infer<typeof configSchema>
export type TemplateCreate = z.infer<typeof createSchema>
export type TemplateRequirement = z.infer<typeof requirementSchema>
export type TemplateNote = z.infer<typeof noteSchema>
export type TemplatePrompt = z.infer<typeof promptSchema>
export type FileEntry = z.infer<typeof fileSchema>
export type PatchEntry = z.infer<typeof patchSchema>
export type Change = z.infer<typeof changeSchema>

/**
 * Wrap a text prompt's answer so it survives {@link tokenizeCommand} as exactly one argv token: an empty
 * value stays empty (contributes nothing), otherwise it's double-quoted with any inner `"` escaped. This is
 * what lets a free-text value with spaces (`--import-alias "my alias"`) splice cleanly into the bootstrap
 * command without the tokenizer splitting it.
 */
function quoteValue(value: string): string {
	if (value === "") return ""
	return `"${value.replaceAll('"', '\\"')}"`
}

/**
 * The CLI fragment a prompt answer maps to — the single place answer→flag translation lives, shared by the
 * interactive collector and the non-interactive default path. `answer` is the chosen option `value`
 * (select), the boolean (confirm), or the raw input (text). Returns the fragment spliced into the bootstrap
 * command for this prompt's `{{token}}`; a select answer with no matching option (a stale `default`) yields
 * the first option's fragment.
 */
export function promptFragment(prompt: TemplatePrompt, answer: string | boolean): string {
	switch (prompt.kind) {
		case "select": {
			const option = prompt.options.find((opt) => opt.value === answer) ?? prompt.options[0]
			return option?.arg ?? ""
		}
		case "confirm":
			return answer ? prompt.arg : prompt.argFalse
		case "text":
			return prompt.arg.replaceAll("{{value}}", quoteValue(String(answer)))
	}
}

/**
 * The answer used non-interactively (`--yes`, non-TTY) — the prompt's declared default, or the first
 * option / empty string when none is set. Returns both the answer (for the choices summary) and the
 * {@link promptFragment} it maps to, so the caller shows a value and splices a flag from one call.
 */
export function resolvePromptDefault(prompt: TemplatePrompt): { answer: string | boolean; arg: string } {
	const answer: string | boolean =
		prompt.kind === "confirm"
			? prompt.default
			: prompt.kind === "select"
				? (prompt.default ?? prompt.options[0]?.value ?? "")
				: (prompt.default ?? "")
	return { answer, arg: promptFragment(prompt, answer) }
}

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
	const changes = [...manifest.changes.base, ...manifest.changes[command]]
	return opts.includeExamples ? changes : changes.filter((change) => !isExample(change))
}

/**
 * The first `init` precondition the project fails, as a ready-to-print abort message, or `undefined` when
 * every requirement passes. `deps` is the project's merged dependencies; `dirExists` tests a
 * project-relative directory. A `dep` requirement checks membership in `deps`, a `dir` requirement checks
 * the tree, each honoring its `match` (`any`/`all`). An unmet requirement yields its own `message`, or a
 * generated fallback when it declares none (the common case for `dep` entries, which detection filters
 * out first). See {@link requirementSchema}.
 */
export function unmetRequirement(
	requires: readonly TemplateRequirement[],
	deps: Record<string, string>,
	dirExists: (rel: string) => boolean,
): string | undefined {
	for (const req of requires) {
		const has = req.kind === "dep" ? (value: string) => value in deps : dirExists
		const satisfied = req.match === "all" ? req.values.every(has) : req.values.some(has)
		if (satisfied) continue
		if (req.message) return req.message
		const noun = req.kind === "dep" ? "package" : "directory"
		return `Kizlo needs ${req.match === "all" ? "all of" : "one of"} these ${noun}s: ${req.values.join(", ")}.`
	}
	return undefined
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
function templateAliasBase(templateDir: string, config: TemplateConfig): string {
	const alias = config.alias.replace(/\/+$/, "")
	const mapping = readTsconfigPaths(templateDir)?.[`${alias}/*`]?.[0]
	if (mapping) return mapping.replace(/^\.\//, "").replace(/\/\*$/, "").replace(/\/+$/, "")
	return config.kizloPath.startsWith("src/") ? "src" : ""
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
function rewriteAliasImports(body: string, fromDir: string, base: string, config: TemplateConfig, ctx: ScaffoldContext): string {
	const alias = config.alias.replace(/\/+$/, "")
	if (!alias) return body
	const pattern = new RegExp(`(["'])${escapeRegExp(alias)}/([^"']+)\\1`, "g")
	return body.replace(pattern, (_match, quote: string, rest: string) => {
		const targetRel = adaptTemplatePath(base ? `${base}/${rest}` : rest, config, ctx)
		return `${quote}${ctx.importFrom(targetRel, fromDir)}${quote}`
	})
}

/**
 * Adapt a template path to the project's real layout. The Kizlo home dir is retargeted to wherever the
 * user put it (`config.kizloPath` → `ctx.kizloPath`). Every other path is `src/`-rooted as authored, so it
 * only needs to match the project's `src/` convention: a project that keeps source under `src/` gets it
 * verbatim, one that doesn't gets the leading `src/` stripped (so `src/app/...` lands at `app/...`, config
 * files at the root are untouched). This makes the one project-wide decision — `src/` or not — instead of
 * tracking a per-framework route directory.
 */
function adaptTemplatePath(relPath: string, config: TemplateConfig, ctx: ScaffoldContext): string {
	const normalized = relPath.split(path.sep).join("/")
	const { kizloPath } = config
	if (normalized === kizloPath || normalized.startsWith(`${kizloPath}/`)) return `${ctx.kizloPath}${normalized.slice(kizloPath.length)}`
	if (!ctx.hasSrcDir && normalized.startsWith("src/")) return normalized.slice("src/".length)
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
export function adaptFile(templateDir: string, entry: FileEntry, config: TemplateConfig, ctx: ScaffoldContext): ScaffoldFile {
	const abs = path.join(templateDir, entry.path)
	if (!fs.existsSync(abs)) {
		throw new Error(`Template file "${entry.path}" is listed in the manifest but does not exist in the template.`)
	}
	const body = fs.readFileSync(abs, "utf8")
	const relPath = adaptTemplatePath(entry.path, config, ctx)
	const fromDir = path.posix.dirname(relPath)
	const contents = rewriteAliasImports(body, fromDir, templateAliasBase(templateDir, config), config, ctx)
	return { label: ROLE_LABELS[entry.role] ?? entry.role, relPath, contents }
}

/** Adapt a patch's path prefix and server-import specifier to the project's real directories. */
export function resolvePatch(entry: PatchEntry, config: TemplateConfig, ctx: ScaffoldContext): ResolvedPatch {
	const relPath = adaptTemplatePath(entry.path, config, ctx)
	const fromDir = path.posix.dirname(relPath)
	const imports = entry.imports.map((imp) => ({
		module: imp.module.replaceAll("{{serverImport}}", ctx.serverImport(fromDir)),
		names: imp.names,
	}))
	return { label: entry.label, relPath, mode: entry.mode, imports, exports: entry.exports, note: entry.note }
}
