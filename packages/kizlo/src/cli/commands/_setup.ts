import { randomBytes } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import * as p from "@clack/prompts"
import { isPluginVersionSupported, pluginUpdateMessage } from "@kizlo/shared"
import getPort, { portNumbers } from "get-port"
import z from "zod/v4"
import { DEFAULT_DEV_DB_PORT, DEFAULT_DEV_PORT, type ResolvedDevConfig, resolveStackName, stackProject } from "../daemon/config"
import { promptFragment, resolvePromptDefault, type TemplateManifest, type TemplatePrompt } from "../presets/template"
import {
	availablePackageManagers,
	DEFAULT_ENV_KEYS,
	detectInvokingPackageManager,
	type EnvKeys,
	ensureGitignored,
	envGroups,
	envKeysPresent,
	mergeEnv,
	type PackageManager,
	pickStackPort,
	writeFileIfAbsent,
} from "../utils"
import { createAdminAppPassword } from "../wp/bootstrap"
import { LOCAL_DIR_REL } from "../wp/constants"
import { bootstrapDev } from "../wp/dev"
import { composeStop, createStack, dockerHint, dockerStatus } from "../wp/docker"
import { removeProjectContainers } from "../wp/session"
import { syncSiteSettings } from "../wp/settings"
import { devStack } from "../wp/stack"

/**
 * The resolved `.env` key names the scaffold writes: the template's declared `env` when it has one, else
 * the {@link DEFAULT_ENV_KEYS} fallback — for an in-repo template before the first stamped release, and
 * for the base no-template fallback (which has no manifest). Threaded into `managedEnv`, `writeEnv`, and
 * `collectConnectionFromEnv` so the scaffold writes the names the pinned runtime reads.
 */
export function resolveEnvKeys(manifest?: TemplateManifest): EnvKeys {
	return manifest?.env ?? DEFAULT_ENV_KEYS
}

/** Remote connection keys — what a real deploy needs, and what `.env.example` always lists. */
function remoteKeys(envKeys: EnvKeys): string[] {
	return [envKeys.remote.siteSecret, envKeys.remote.wpUrl, envKeys.remote.wpUsername, envKeys.remote.wpPassword]
}

/**
 * The WordPress connection both `init` and `create` collect. It carries everything the shared
 * `.env` writing, local provisioning, and settings sync need. The framework-specific pieces
 * (`init`'s Kizlo directory / import alias) live on top of this in the command itself.
 */
export interface Connection {
	/**
	 * Where the WordPress connection comes from. `local` spins up Docker WordPress during
	 * setup and fills the WP credentials from it; `remote` collects them from the user.
	 */
	mode: "local" | "remote"
	/** The Kizlo backend URL (where the handler is mounted); the plugin's `backend_url`. */
	baseUrl: string
	/**
	 * Canonical public site URL → plugin `url`. Set only for the base preset, where the backend can
	 * live on a different origin than the site. Framework presets leave it unset (the site URL is the
	 * backend's origin), and the local dev path never persists it.
	 */
	siteUrl?: string
	siteSecret: string
	wpUrl: string
	wpUsername: string
	wpPassword: string
	/**
	 * One-time wp-admin login password from a fresh local install, surfaced in the "Next steps" box.
	 * Set by {@link setupLocalWordPress}; absent when resuming an existing stack (nothing to show).
	 */
	adminPassword?: string
}

/**
 * The `.env` keys setup manages and the values to write, branched on the connection mode. Local
 * WordPress writes the `KIZLO_LOCAL_WP_*` / `KIZLO_LOCAL_WP_SECRET` set plus `KIZLO_CONNECT=local`,
 * so it never touches the remote keys (a user can point those at a real site). A remote site writes
 * the bare remote keys exactly as before — no `KIZLO_CONNECT`, since `"remote"` is the default.
 */
export function managedEnv(envKeys: EnvKeys, conn: Connection): { keys: string[]; values: Record<string, string> } {
	if (conn.mode === "local") {
		const { connect, siteSecret, wpUrl, wpUsername, wpPassword } = envKeys.local
		return {
			keys: [envKeys.baseUrl, connect, siteSecret, wpUrl, wpUsername, wpPassword],
			values: {
				[envKeys.baseUrl]: conn.baseUrl,
				[connect]: "local",
				[siteSecret]: conn.siteSecret,
				[wpUrl]: conn.wpUrl,
				[wpUsername]: conn.wpUsername,
				[wpPassword]: conn.wpPassword,
			},
		}
	}
	const { siteSecret, wpUrl, wpUsername, wpPassword } = envKeys.remote
	return {
		keys: [envKeys.baseUrl, siteSecret, wpUrl, wpUsername, wpPassword],
		values: {
			[envKeys.baseUrl]: conn.baseUrl,
			[siteSecret]: conn.siteSecret,
			[wpUrl]: conn.wpUrl,
			[wpUsername]: conn.wpUsername,
			[wpPassword]: conn.wpPassword,
		},
	}
}

const requiredString = z.string().trim().min(1, "Required")

const httpProtocol = /^https?$/
const reachableHostname = /^(localhost|(\d{1,3}\.){3}\d{1,3}|([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})$/
const urlString = requiredString.pipe(
	z.url({
		protocol: httpProtocol,
		hostname: reachableHostname,
		error: "Must be a valid http(s) URL with a real host (e.g. https://example.com)",
	}),
)
const dirPath = requiredString.refine((value) => !value.endsWith(".ts"), "Enter a directory, not a file")

export { dirPath, requiredString, urlString }

export function validate(schema: z.ZodType) {
	return (value: string | undefined): string | undefined => {
		const result = schema.safeParse(value ?? "")
		return result.success ? undefined : result.error.issues[0]?.message
	}
}

export function orCancel<T>(value: T | symbol): T {
	if (p.isCancel(value)) {
		p.cancel("Setup cancelled.")
		process.exit(0)
	}
	return value as T
}

/** Package managers the CLI can wire getting-started steps for, in display order. */
export const PACKAGE_MANAGERS: readonly PackageManager[] = ["pnpm", "npm", "yarn", "bun"]

/**
 * Ask which package manager to use, offering only those installed on the host. The pre-selected default
 * is the manager that invoked this CLI when it's available (a hint, not a decision — `npx` reports
 * `npm`, so it can be wrong, which is exactly why we ask rather than commit to it), else the first
 * installed. `create` asks up front; `init` asks only when it couldn't detect one from the project.
 */
export async function selectPackageManager(message: string): Promise<PackageManager> {
	const installed = availablePackageManagers(PACKAGE_MANAGERS)
	const invoking = detectInvokingPackageManager()
	const initialValue = invoking && installed.includes(invoking) ? invoking : installed[0]
	return orCancel(
		await p.select<PackageManager>({
			message,
			options: installed.map((id) => ({ value: id, label: id })),
			initialValue,
		}),
	)
}

/** The choices summary shows a prompt under a short label — the title-cased token (`linter` → `Linter`). */
function promptLabel(token: string): string {
	return token.charAt(0).toUpperCase() + token.slice(1)
}

/** What a resolved prompt answer reads as in the choices summary: the option label, `Yes`/`No`, or the text. */
function promptDisplay(prompt: TemplatePrompt, answer: string | boolean): string {
	if (prompt.kind === "confirm") return answer ? "Yes" : "No"
	if (prompt.kind === "select") return prompt.options.find((opt) => opt.value === answer)?.label ?? String(answer)
	return answer === "" ? "(default)" : String(answer)
}

/**
 * Ask the template's own prompts and turn the answers into `bootstrap` substitutions. Each prompt maps its
 * answer to a CLI fragment (via {@link promptFragment}) keyed by the prompt's `{{token}}`, which
 * `bootstrapArgs` splices into the framework command — so a template surfaces a real framework choice
 * without the CLI knowing anything framework-specific. Non-interactive (`--yes`) resolves every prompt to
 * its {@link resolvePromptDefault} with no I/O. Returns the token→fragment map plus the choices-summary rows.
 */
export async function collectTemplatePrompts(
	manifest: TemplateManifest,
	opts: { yes: boolean },
): Promise<{ args: Record<string, string>; rows: [string, string][] }> {
	const args: Record<string, string> = {}
	const rows: [string, string][] = []
	for (const prompt of manifest.create?.prompts ?? []) {
		let answer: string | boolean
		if (opts.yes) {
			answer = resolvePromptDefault(prompt).answer
		} else if (prompt.kind === "select") {
			answer = orCancel(
				await p.select({
					message: prompt.message,
					options: prompt.options.map((opt) => ({ value: opt.value, label: opt.label })),
					initialValue: prompt.default ?? prompt.options[0]?.value,
				}),
			)
		} else if (prompt.kind === "confirm") {
			answer = orCancel(await p.confirm({ message: prompt.message, initialValue: prompt.default }))
		} else {
			answer = orCancel(await p.text({ message: prompt.message, placeholder: prompt.placeholder, defaultValue: prompt.default ?? "" }))
		}
		args[prompt.token] = promptFragment(prompt, answer)
		rows.push([promptLabel(prompt.token), promptDisplay(prompt, answer)])
	}
	return { args, rows }
}

/** Appends the API path to the base URL so the client and route handler agree. */
export function withApiPath(baseUrl: string, apiPath: string): string {
	try {
		const url = new URL(baseUrl)
		const current = url.pathname.replace(/\/+$/, "")
		if (current.endsWith(apiPath)) return url.toString().replace(/\/+$/, "")
		url.pathname = `${current}${apiPath}`
		return url.toString().replace(/\/+$/, "")
	} catch {
		return baseUrl
	}
}

/** The conventional starting port a scaffolded app's dev server serves from. */
const DEFAULT_APP_PORT = 3000

/**
 * Pick a free port for a freshly scaffolded app, preferring {@link DEFAULT_APP_PORT} and stepping
 * upward when it's taken. `create` builds the app URL from this and writes it into `.env`, which is
 * synced to WordPress as the event/webhook delivery target — so defaulting it to a port already in use
 * would hand WordPress an unreachable URL, and it fails *silently* there (events just never arrive).
 * `get-port` probes every loopback family (including the IPv6 `::1` a dev server often binds on macOS),
 * so it never returns a port that's really in use. `init` doesn't use this — an existing project owns
 * its own port, so it asks the user instead.
 */
export function pickAppPort(): Promise<number> {
	return getPort({ port: portNumbers(DEFAULT_APP_PORT, DEFAULT_APP_PORT + 100) })
}

/**
 * Collect the WordPress connection interactively: the backend/site URLs, the webhook signing
 * secret, and either the local-dev folder or a remote site's credentials. The caller layers any
 * framework-specific prompts (directory, import alias) on top of what this returns.
 *
 * When `baseUrl` is supplied the public-URL prompt is skipped and that value is used verbatim —
 * `create` scaffolds a brand-new app that has no public URL yet, so it defaults to the local dev
 * origin and lets the user fill in production later.
 */
export async function collectConnectionInteractively(apiPath: string | undefined, opts: { baseUrl?: string } = {}): Promise<Connection> {
	let siteUrl: string | undefined
	let baseUrl: string
	if (opts.baseUrl !== undefined) {
		baseUrl = opts.baseUrl
	} else if (apiPath) {
		baseUrl = orCancel(await p.text({ message: "Public app URL", placeholder: "https://your-app.com", validate: validate(urlString) }))
	} else {
		siteUrl = orCancel(await p.text({ message: "Public site URL", placeholder: "https://your-app.com", validate: validate(urlString) }))
		baseUrl = orCancel(
			await p.text({
				message: "Kizlo backend URL (where the handler is mounted)",
				placeholder: "https://your-app.com/kizlo",
				validate: validate(urlString),
			}),
		)
	}

	const secretMode = orCancel(
		await p.select({
			message: "Site secret (webhook signing key)",
			initialValue: "generate" as const,
			options: [
				{ value: "generate" as const, label: "Generate a secure secret automatically", hint: "recommended" },
				{ value: "enter" as const, label: "Enter my own" },
			],
		}),
	)

	const siteSecret =
		secretMode === "enter"
			? orCancel(await p.password({ message: "Enter the site secret", validate: validate(requiredString) }))
			: randomBytes(32).toString("hex")

	const mode = orCancel(
		await p.select({
			message: "WordPress connection",
			initialValue: "local" as const,
			options: [
				{ value: "local" as const, label: "Set up local WordPress", hint: "runs in Docker, for dev and test" },
				{ value: "remote" as const, label: "Use my own WordPress", hint: "connect to your existing WordPress" },
				{ value: "skip" as const, label: "Skip for now", hint: "fill in the connection in .env later" },
			],
		}),
	)

	// Local WordPress needs a running Docker daemon. When it isn't ready we can't provision, so say
	// exactly why (not installed vs. not running) and stop — re-run once Docker is up.
	if (mode === "local") {
		const status = await dockerStatus()
		if (status !== "running") {
			p.cancel(dockerHint(status))
			process.exit(1)
		}
	}

	let wpUrl = ""
	let wpUsername = ""
	let wpPassword = ""
	if (mode === "remote") {
		wpUrl = orCancel(await p.text({ message: "WordPress URL", placeholder: "https://wp.your-app.com", validate: validate(urlString) }))
		wpUsername = orCancel(await p.text({ message: "WordPress username", validate: validate(requiredString) }))
		wpPassword = orCancel(await p.password({ message: "WordPress application password", validate: validate(requiredString) }))
	}
	// Local mode needs nothing more — the install folder is fixed (`.kizlo/local`) and provisioned on setup.
	if (mode === "skip") {
		p.log.info("Skipping WordPress setup — the connection keys are written to .env empty for you to fill in later.")
	}

	// `skip` leaves the credentials blank and behaves like a remote connection downstream: nothing to
	// provision, and `syncRemote` no-ops on the empty credentials until the user fills them in.
	return { mode: mode === "local" ? "local" : "remote", baseUrl, siteUrl, siteSecret, wpUrl, wpUsername, wpPassword }
}

/**
 * Non-interactive connection: skip prompts and use env values where present. Missing ones are
 * left empty for the user to fill in later. Never fails — always yields a fillable project.
 */
export function collectConnectionFromEnv(envKeys: EnvKeys): Connection {
	return {
		mode: "remote",
		baseUrl: process.env[envKeys.baseUrl]?.trim() ?? "",
		siteSecret: process.env[envKeys.remote.siteSecret]?.trim() || randomBytes(32).toString("hex"),
		wpUrl: process.env[envKeys.remote.wpUrl]?.trim() ?? "",
		wpUsername: process.env[envKeys.remote.wpUsername]?.trim() ?? "",
		wpPassword: process.env[envKeys.remote.wpPassword]?.trim() ?? "",
	}
}

/** Build a {@link ResolvedDevConfig} for the fixed `.kizlo/local` install, matching `resolveDevConfig`'s
 * defaults — built directly so setup never has to round-trip through the config file it's writing. */
function devConfigFor(cwd: string): ResolvedDevConfig {
	return {
		configDir: cwd,
		project: stackProject(resolveStackName(cwd), "dev"),
		port: DEFAULT_DEV_PORT,
		portExplicit: false,
		dbPort: DEFAULT_DEV_DB_PORT,
		dbPortExplicit: false,
		fixtures: [],
		wordpressPath: LOCAL_DIR_REL,
		wordpressDir: path.resolve(cwd, LOCAL_DIR_REL),
	}
}

/** Connection details captured from freshly provisioned local WordPress. */
interface LocalStack {
	url: string
	username: string
	/** REST application password minted for `.env` (local WordPress doesn't make one itself). */
	appPassword: string
	/** One-time wp-admin login password, shown only on a fresh install. */
	adminPassword?: string
	/** Set when pushing `KIZLO_LOCAL_WP_SECRET` into the local plugin failed (warn-and-continue). */
	secretSyncError?: string
}

/**
 * Boot local WordPress once to produce working credentials, then stop it (volumes
 * persist, so a later `kizlo dev` resumes instantly). Local WordPress mints no application
 * password — that's a test concern — so we create one here for REST auth in `.env`.
 * While it's still up, push the site settings (`siteSecret` plus the Kizlo server's
 * `url`/`backend_url`, derived from `baseUrl`) into the plugin so webhook signing and event delivery
 * work.
 */
async function provisionLocalStack(cfg: ResolvedDevConfig, siteSecret: string, baseUrl: string): Promise<LocalStack> {
	await removeProjectContainers(cfg.project)
	const port = await pickStackPort(cfg.port, { fixed: cfg.portExplicit, configKey: "dev.port" })
	const dbPort = await pickStackPort(cfg.dbPort, { fixed: cfg.dbPortExplicit, host: "127.0.0.1", configKey: "dev.dbPort" })
	const ready: ResolvedDevConfig = { ...cfg, port, dbPort }
	createStack(devStack(ready))

	const info = await bootstrapDev(ready)
	const appPassword = info.appPassword ?? (await createAdminAppPassword("kizlo"))
	const sync = await syncSiteSettings(
		{ url: info.url, username: info.username, password: appPassword },
		{ secret: siteSecret, backendUrl: baseUrl, containerized: true },
	)
	await composeStop()
	return {
		url: info.url,
		username: info.username,
		appPassword,
		adminPassword: info.secrets?.password,
		secretSyncError: sync.ok ? undefined : sync.error,
	}
}

/**
 * Provision local WordPress and fill the connection's WP credentials from it. Mutates `conn` in place
 * (wpUrl / wpUsername / wpPassword / adminPassword). Owns no spinner and never exits — it runs as one
 * step of the execute checklist, so it throws on failure for the runner to render, and returns a
 * non-fatal warning string (or `undefined`) the caller surfaces after the run. Writing the `local` flags
 * into `kizlo.config.ts` is the caller's job. No-op for a remote connection.
 */
export async function provisionLocalWordPress(cwd: string, conn: Connection): Promise<string | undefined> {
	if (conn.mode !== "local") return undefined
	ensureGitignored(cwd, ".kizlo/")
	const local = await provisionLocalStack(devConfigFor(cwd), conn.siteSecret, conn.baseUrl)
	conn.wpUrl = local.url
	conn.wpUsername = local.username
	conn.wpPassword = local.appPassword
	conn.adminPassword = local.adminPassword
	return local.secretSyncError ? `Could not sync KIZLO_LOCAL_WP_SECRET to the local plugin (${local.secretSyncError})` : undefined
}

/**
 * The template's own `.env.example`, when it ships one. Templates own the framework-specific key names
 * (e.g. `NEXT_PUBLIC_KIZLO_API_URL`) and the shared section layout, so their file is the source of the
 * scaffold's `.env.example` — see {@link writeEnv}. Undefined for the base preset (no template dir).
 */
export function readEnvExample(templateDir: string): string | undefined {
	const file = path.join(templateDir, ".env.example")
	return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined
}

/**
 * The `.env.example` body for the base preset, which ships no template file. Lists the API URL and the
 * remote connection keys, then the commented `KIZLO_CONNECT=local` toggle for the local-dev path. Real
 * templates carry their own `.env.example` (passed to {@link writeEnv}) so its structure and comments
 * stay consistent with the `.env` the scaffold writes.
 */
function generatedEnvExample(envKeys: EnvKeys): string {
	const exampleKeys = [envKeys.baseUrl, ...remoteKeys(envKeys)]
	const exampleValues = Object.fromEntries(exampleKeys.map((key) => [key, ""]))
	const { content } = mergeEnv("", exampleValues, new Set(exampleKeys), envGroups(envKeys))
	return `${content}\n# Point the app at local WordPress (managed by \`kizlo dev\`) instead of the keys above:\n# ${envKeys.local.connect}=local\n`
}

/**
 * The managed keys already present in an existing `.env` — the values a write would overwrite. Collected
 * up front (before anything runs) so the overwrite decision is made during the lazy prompt phase and
 * passed to {@link writeEnv} as a resolved `overwrite` flag, rather than {@link writeEnv} stopping to ask
 * mid-checklist. Empty when there's no `.env` or nothing collides.
 */
export function envConflicts(cwd: string, envKeys: EnvKeys, conn: Connection): string[] {
	const { keys } = managedEnv(envKeys, conn)
	const envPath = path.join(cwd, ".env")
	if (!fs.existsSync(envPath)) return []
	return envKeysPresent(fs.readFileSync(envPath, "utf8"), keys)
}

/**
 * Write (or update) `.env` and `.env.example` for the managed keys and return a one-line summary for the
 * checklist. Runs as a step of the execute phase, so it neither prompts nor logs: `overwrite` (whether to
 * replace conflicting values) is decided during collection — see {@link envConflicts} — and passed in.
 * `.env.example` is only written when absent, sourced from the template's own file (`opts.exampleTemplate`)
 * so it matches the `.env` structure, falling back to a generated block for the base preset.
 */
export function writeEnv(cwd: string, envKeys: EnvKeys, conn: Connection, opts: { overwrite: boolean; exampleTemplate?: string }): string {
	const { keys, values: envValues } = managedEnv(envKeys, conn)

	const envPath = path.join(cwd, ".env")
	const envExisted = fs.existsSync(envPath)
	const existingEnv = envExisted ? fs.readFileSync(envPath, "utf8") : ""
	const overwriteKeys = opts.overwrite ? new Set<string>(keys) : new Set<string>()

	const merge = mergeEnv(existingEnv, envValues, overwriteKeys, envGroups(envKeys))
	fs.writeFileSync(envPath, merge.content)

	const exampleBody = opts.exampleTemplate ?? generatedEnvExample(envKeys)
	const exampleCreated = writeFileIfAbsent(path.join(cwd, ".env.example"), exampleBody)

	const envMsg = !envExisted ? "Created .env" : merge.updated.length || merge.added.length ? "Updated .env" : "Left .env unchanged"
	return exampleCreated ? `${envMsg}, created .env.example` : envMsg
}

/**
 * Push the site settings (secret, canonical site URL, backend URL) to a remote WordPress so webhook
 * signing and event delivery work. No-op for local (handled during provisioning) or when credentials are
 * incomplete. Runs as a checklist step, so instead of logging it returns any non-fatal warnings (a failed
 * sync, an outdated plugin) for the caller to surface after the run; success returns an empty array.
 */
export async function syncRemote(conn: Connection): Promise<string[]> {
	if (conn.mode !== "remote" || !conn.wpUrl || !conn.wpUsername || !conn.wpPassword) return []
	const sync = await syncSiteSettings(
		{ url: conn.wpUrl, username: conn.wpUsername, password: conn.wpPassword },
		{ secret: conn.siteSecret, siteUrl: conn.siteUrl, backendUrl: conn.baseUrl },
	)
	if (!sync.ok) {
		return [
			`Could not sync the site settings to WordPress (${sync.error}) — make sure the kizlo plugin is active, then set them from the Kizlo settings.`,
		]
	}
	return isPluginVersionSupported(sync.pluginVersion) ? [] : [pluginUpdateMessage(sync.pluginVersion)]
}

/** The "Next steps" lines. `kizlo dev` is the single entry point for development. */
export function nextStepsLines(conn: Connection, prefix = ""): string[] {
	const login =
		conn.mode === "local" && conn.adminPassword
			? [``, `Log in to wp-admin (${conn.wpUrl}/wp-admin):`, `  ${conn.wpUsername} / ${conn.adminPassword} — save it, it's shown only once`]
			: []
	return [`Start developing:`, `  ${prefix}npx kizlo dev`, ...login]
}

/** The shared "Next steps" note. */
export function nextStepsNote(conn: Connection, prefix = ""): void {
	p.note(nextStepsLines(conn, prefix).join("\n"), "Next steps")
}
