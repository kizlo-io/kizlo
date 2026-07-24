import { randomBytes } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import * as p from "@clack/prompts"
import getPort, { portNumbers } from "get-port"
import z from "zod/v4"
import { DEFAULT_DEV_DB_PORT, DEFAULT_DEV_PORT, type ResolvedDevConfig, resolveStackName } from "../daemon/config"
import type { Preset } from "../presets"
import { ensureGitignored, envGroups, envKeysPresent, mergeEnv, pickStackPort, writeFileIfAbsent } from "../utils"
import { createAdminAppPassword } from "../wp/bootstrap"
import { bootstrapDev } from "../wp/dev"
import { composeStop, createStack } from "../wp/docker"
import { removeProjectContainers } from "../wp/session"
import { syncSiteSettings } from "../wp/settings"
import { devStack } from "../wp/stack"

/** Production connection keys — what a real deploy needs, and what `.env.example` always lists. */
export const PROD_WP_ENV_KEYS = [
	"KIZLO_SITE_SECRET",
	"KIZLO_WORDPRESS_URL",
	"KIZLO_WORDPRESS_USERNAME",
	"KIZLO_WORDPRESS_APPLICATION_PASSWORD",
] as const

/**
 * The WordPress connection both `init` and `create` collect. It carries everything the shared
 * `.env` writing, local provisioning, and settings sync need. The framework-specific pieces
 * (`init`'s Kizlo directory / import alias) live on top of this in the command itself.
 */
export interface Connection {
	/**
	 * Where the WordPress connection comes from. `local` spins up a Docker dev stack during
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
	/** Folder the local WordPress install lives in (`dev.path`); set only when `mode` is `local`. */
	devPath?: string
	/**
	 * One-time wp-admin login password from a fresh local install, surfaced in the "Next steps" box.
	 * Set by {@link setupLocalWordPress}; absent when resuming an existing stack (nothing to show).
	 */
	adminPassword?: string
}

/**
 * The `.env` keys setup manages and the values to write, branched on the connection mode. A local
 * dev stack writes the `KIZLO_DEV_WORDPRESS_*` / `KIZLO_DEV_SITE_SECRET` set plus `KIZLO_TARGET=dev`, so it
 * never touches the production keys (a user can point those at a real site). A remote site writes the
 * bare production keys exactly as before — no `KIZLO_TARGET`, since `"production"` is the default target.
 */
export function managedEnv(preset: Preset, conn: Connection): { keys: string[]; values: Record<string, string> } {
	if (conn.mode === "local") {
		return {
			keys: [
				preset.baseUrlEnvKey,
				"KIZLO_TARGET",
				"KIZLO_DEV_SITE_SECRET",
				"KIZLO_DEV_WORDPRESS_URL",
				"KIZLO_DEV_WORDPRESS_USERNAME",
				"KIZLO_DEV_WORDPRESS_APPLICATION_PASSWORD",
			],
			values: {
				[preset.baseUrlEnvKey]: conn.baseUrl,
				KIZLO_TARGET: "dev",
				KIZLO_DEV_SITE_SECRET: conn.siteSecret,
				KIZLO_DEV_WORDPRESS_URL: conn.wpUrl,
				KIZLO_DEV_WORDPRESS_USERNAME: conn.wpUsername,
				KIZLO_DEV_WORDPRESS_APPLICATION_PASSWORD: conn.wpPassword,
			},
		}
	}
	return {
		keys: [preset.baseUrlEnvKey, ...PROD_WP_ENV_KEYS],
		values: {
			[preset.baseUrlEnvKey]: conn.baseUrl,
			KIZLO_SITE_SECRET: conn.siteSecret,
			KIZLO_WORDPRESS_URL: conn.wpUrl,
			KIZLO_WORDPRESS_USERNAME: conn.wpUsername,
			KIZLO_WORDPRESS_APPLICATION_PASSWORD: conn.wpPassword,
		},
	}
}

const requiredString = z.string().trim().min(1, "Required")
const urlString = requiredString.pipe(z.url("Must be a valid URL (e.g. https://example.com)"))
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
export async function collectConnectionInteractively(preset: Preset, opts: { baseUrl?: string } = {}): Promise<Connection> {
	let siteUrl: string | undefined
	let baseUrl: string
	if (opts.baseUrl !== undefined) {
		baseUrl = opts.baseUrl
	} else if (preset.apiPath) {
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
				{ value: "local" as const, label: "Set up a local dev environment", hint: "runs WordPress in Docker" },
				{ value: "remote" as const, label: "Use my own WordPress", hint: "connect to an existing site" },
			],
		}),
	)

	let wpUrl = ""
	let wpUsername = ""
	let wpPassword = ""
	let devPath: string | undefined
	if (mode === "remote") {
		wpUrl = orCancel(await p.text({ message: "WordPress URL", placeholder: "https://wp.your-app.com", validate: validate(urlString) }))
		wpUsername = orCancel(await p.text({ message: "WordPress username", validate: validate(requiredString) }))
		wpPassword = orCancel(await p.password({ message: "WordPress application password", validate: validate(requiredString) }))
	} else {
		devPath = orCancel(await p.text({ message: "Local WordPress folder", initialValue: "wordpress", validate: validate(dirPath) }))
	}

	return { mode, baseUrl, siteUrl, siteSecret, wpUrl, wpUsername, wpPassword, devPath }
}

/**
 * Non-interactive connection: skip prompts and use env values where present. Missing ones are
 * left empty for the user to fill in later. Never fails — always yields a fillable project.
 */
export function collectConnectionFromEnv(preset: Preset): Connection {
	return {
		mode: "remote",
		baseUrl: process.env[preset.baseUrlEnvKey]?.trim() ?? "",
		siteSecret: process.env.KIZLO_SITE_SECRET?.trim() || randomBytes(32).toString("hex"),
		wpUrl: process.env.KIZLO_WORDPRESS_URL?.trim() ?? "",
		wpUsername: process.env.KIZLO_WORDPRESS_USERNAME?.trim() ?? "",
		wpPassword: process.env.KIZLO_WORDPRESS_APPLICATION_PASSWORD?.trim() ?? "",
	}
}

/** Build a {@link ResolvedDevConfig} from the chosen install folder, matching `resolveDevConfig`'s
 * defaults — built directly so setup never has to round-trip through the config file it's writing. */
function devConfigFor(cwd: string, devPath: string): ResolvedDevConfig {
	return {
		configDir: cwd,
		project: `${resolveStackName(cwd)}-dev`,
		port: DEFAULT_DEV_PORT,
		portExplicit: false,
		dbPort: DEFAULT_DEV_DB_PORT,
		dbPortExplicit: false,
		fixtures: [],
		wordpressPath: devPath,
		wordpressDir: path.resolve(cwd, devPath),
	}
}

/** Connection details captured from a freshly provisioned local stack. */
interface LocalStack {
	url: string
	username: string
	/** REST application password minted for `.env` (the dev stack doesn't make one itself). */
	appPassword: string
	/** One-time wp-admin login password, shown only on a fresh install. */
	adminPassword?: string
	/** Set when pushing `KIZLO_DEV_SITE_SECRET` into the local plugin failed (warn-and-continue). */
	secretSyncError?: string
}

/**
 * Boot the local dev stack once to produce working credentials, then stop it (volumes
 * persist, so a later `kizlo dev` resumes instantly). The dev stack mints no application
 * password — that's a test-stack concern — so we create one here for REST auth in `.env`.
 * While the stack is still up, push the dev site settings (`siteSecret` plus the Kizlo server's
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
 * Provision the local WordPress dev stack and fill the connection's WP credentials from it, then
 * report the outcome. Mutates `conn` in place (wpUrl / wpUsername / wpPassword). Exits on failure,
 * matching the previous inline behavior. No-op for a remote connection.
 */
export async function setupLocalWordPress(cwd: string, conn: Connection): Promise<void> {
	if (conn.mode !== "local" || !conn.devPath) return
	ensureGitignored(cwd, conn.devPath)
	const s = p.spinner()
	s.start("Setting up local WordPress (first run downloads images, this can take a while)")
	try {
		const local = await provisionLocalStack(devConfigFor(cwd, conn.devPath), conn.siteSecret, conn.baseUrl)
		conn.wpUrl = local.url
		conn.wpUsername = local.username
		conn.wpPassword = local.appPassword
		conn.adminPassword = local.adminPassword
		s.stop("Local WordPress ready")
		if (local.secretSyncError) p.log.warn(`Could not sync KIZLO_DEV_SITE_SECRET to the local plugin (${local.secretSyncError})`)
	} catch (error) {
		s.stop("Local WordPress setup failed")
		p.cancel(error instanceof Error ? error.message : String(error))
		process.exit(1)
	}
}

/**
 * Write (or update) `.env` and `.env.example` for the managed keys and report the outcome.
 * Existing conflicting `.env` values are preserved unless `force`; interactively the user is asked,
 * and under `--yes` they are kept. `.env.example` is only written when absent.
 */
export async function writeEnv(cwd: string, preset: Preset, conn: Connection, opts: { force: boolean; yes: boolean }): Promise<void> {
	const { keys, values: envValues } = managedEnv(preset, conn)

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

	const merge = mergeEnv(existingEnv, envValues, overwriteKeys, envGroups(preset.baseUrlEnvKey))
	fs.writeFileSync(envPath, merge.content)

	const exampleKeys = [preset.baseUrlEnvKey, ...PROD_WP_ENV_KEYS]
	const exampleValues = Object.fromEntries(exampleKeys.map((key) => [key, ""]))
	const { content: exampleEnv } = mergeEnv("", exampleValues, new Set(exampleKeys), envGroups(preset.baseUrlEnvKey))
	const exampleBody = `${exampleEnv}\n# Point the app at a local dev stack (managed by \`kizlo dev\`) instead of the keys above:\n# KIZLO_TARGET=dev\n`
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
	if (!sync.ok)
		p.log.warn(
			`Could not sync the site settings to WordPress (${sync.error}) — make sure the kizlo plugin is active, then set them from the Kizlo settings.`,
		)
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
