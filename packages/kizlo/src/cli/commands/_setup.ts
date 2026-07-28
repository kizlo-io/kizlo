import { randomBytes } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import * as p from "@clack/prompts"
import { isPluginVersionSupported, pluginUpdateMessage } from "@kizlo/shared"
import getPort, { portNumbers } from "get-port"
import z from "zod/v4"
import { DEFAULT_DEV_DB_PORT, DEFAULT_DEV_PORT, type ResolvedDevConfig, resolveStackName } from "../daemon/config"
import type { TemplateManifest } from "../presets/template"
import {
	DEFAULT_ENV_KEYS,
	type EnvKeys,
	ensureGitignored,
	envGroups,
	envKeysPresent,
	mergeEnv,
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

	return { mode, baseUrl, siteUrl, siteSecret, wpUrl, wpUsername, wpPassword }
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
		project: `${resolveStackName(cwd)}-dev`,
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
 * Provision local WordPress and fill the connection's WP credentials from it, then report the
 * outcome. Mutates `conn` in place (wpUrl / wpUsername / wpPassword). Writing the `local` flags into
 * `kizlo.config.ts` is the caller's job (the generated config for `create`/`init`). Exits on failure.
 * No-op for a remote connection.
 */
export async function setupLocalWordPress(cwd: string, conn: Connection): Promise<void> {
	if (conn.mode !== "local") return
	ensureGitignored(cwd, ".kizlo/")
	const s = p.spinner()
	s.start("Setting up local WordPress (first run downloads images, this can take a while)")
	try {
		const local = await provisionLocalStack(devConfigFor(cwd), conn.siteSecret, conn.baseUrl)
		conn.wpUrl = local.url
		conn.wpUsername = local.username
		conn.wpPassword = local.appPassword
		conn.adminPassword = local.adminPassword
		s.stop("Local WordPress ready")
		if (local.secretSyncError) p.log.warn(`Could not sync KIZLO_LOCAL_WP_SECRET to the local plugin (${local.secretSyncError})`)
	} catch (error) {
		s.stop("Local WordPress setup failed")
		p.cancel(error instanceof Error ? error.message : String(error))
		process.exit(1)
	}
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
 * Write (or update) `.env` and `.env.example` for the managed keys and report the outcome.
 * Existing conflicting `.env` values are preserved unless `force`; interactively the user is asked,
 * and under `--yes` they are kept. `.env.example` is only written when absent, and is sourced from the
 * template's own file (`opts.exampleTemplate`) so it matches the `.env` structure, falling back to a
 * generated block for the base preset.
 */
export async function writeEnv(
	cwd: string,
	envKeys: EnvKeys,
	conn: Connection,
	opts: { force: boolean; yes: boolean; exampleTemplate?: string },
): Promise<void> {
	const { keys, values: envValues } = managedEnv(envKeys, conn)

	const envPath = path.join(cwd, ".env")
	const envExisted = fs.existsSync(envPath)
	const existingEnv = envExisted ? fs.readFileSync(envPath, "utf8") : ""
	const conflicts = envKeysPresent(existingEnv, keys)

	let overwriteKeys = new Set<string>(keys)
	if (conflicts.length && !opts.force) {
		if (opts.yes) {
			overwriteKeys = new Set()
			p.log.info("Keeping existing .env values (pass --force to overwrite)")
		} else {
			p.log.warn("Some environment variables already exist in .env")
			const overwrite = orCancel(await p.confirm({ message: "Overwrite their existing values?", initialValue: true }))
			if (!overwrite) overwriteKeys = new Set()
		}
	}

	const merge = mergeEnv(existingEnv, envValues, overwriteKeys, envGroups(envKeys))
	fs.writeFileSync(envPath, merge.content)

	const exampleBody = opts.exampleTemplate ?? generatedEnvExample(envKeys)
	const exampleCreated = writeFileIfAbsent(path.join(cwd, ".env.example"), exampleBody)

	if (!envExisted) {
		p.log.success("Created .env")
	} else if (merge.updated.length || merge.added.length) {
		p.log.success("Updated .env")
	} else {
		p.log.info("Left .env unchanged")
	}
	p.log.success(exampleCreated ? "Created .env.example" : "Skipped .env.example (exists)")
}

/**
 * Push the site settings (secret, canonical site URL, backend URL) to a remote WordPress so
 * webhook signing and event delivery work. No-op for local (handled during provisioning) or when
 * credentials are incomplete. Warns and continues on failure.
 */
export async function syncRemote(conn: Connection): Promise<void> {
	if (conn.mode !== "remote" || !conn.wpUrl || !conn.wpUsername || !conn.wpPassword) return
	const sync = await syncSiteSettings(
		{ url: conn.wpUrl, username: conn.wpUsername, password: conn.wpPassword },
		{ secret: conn.siteSecret, siteUrl: conn.siteUrl, backendUrl: conn.baseUrl },
	)
	if (!sync.ok) {
		p.log.warn(
			`Could not sync the site settings to WordPress (${sync.error}) — make sure the kizlo plugin is active, then set them from the Kizlo settings.`,
		)
		return
	}
	if (!isPluginVersionSupported(sync.pluginVersion)) p.log.warn(pluginUpdateMessage(sync.pluginVersion))
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
