import { randomBytes } from "node:crypto"
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { defineCommand } from "citty"
import { palette } from "../banner"
import { hasDevStack, type ResolvedDevConfig, resolveDevConfig } from "../daemon/config"
import { startWatcher } from "../daemon/watch"
import { ensureGitignored, envGroups, groupDefault, mergeEnv, pickStackPort, withSpinner } from "../utils"
import { bootstrapDev, type DevStackInfo } from "../wp/dev"
import { createStack, type DockerStack } from "../wp/docker"
import { reapOrphans, registerSession, removeProjectContainers, spawnWatchdog, unregisterSession } from "../wp/session"
import { syncSiteSettings } from "../wp/settings"
import { devStack } from "../wp/stack"

async function resolve(cwd: string): Promise<{ cfg: ResolvedDevConfig; stack: DockerStack }> {
	const cfg = await resolveDevConfig(cwd)
	return { cfg, stack: createStack(devStack(cfg)) }
}

/**
 * The stack lifecycle subcommands (`stop`/`down`/`reset`) only act on a local WordPress
 * Docker stack. A bring-your-own-WordPress project (no `dev.path`) has no stack to manage,
 * so — rather than fall through to `resolveDevConfig`'s hard "`dev.path` is required" error —
 * print a plain note explaining there's nothing to do and exit cleanly. Returns true when a
 * local stack is configured and the caller may proceed.
 */
async function requireDevStack(cwd: string): Promise<boolean> {
	if (await hasDevStack(cwd)) return true
	note("No local WordPress stack is configured (`dev.path` is unset) — nothing to manage here.")
	return false
}

/** A dim, untagged one-liner (no consola timestamp) for the clean dev output. */
function note(text: string): void {
	const { dim, reset } = palette()
	process.stdout.write(`   ${dim}${text}${reset}\n`)
}

/**
 * Print the connection summary as an aligned, Next.js-style block. Shows the wp-admin URL on
 * the loopback ("Local") and — when the stack is installed on a LAN address rather than
 * localhost — on the network, so it can be opened from other devices. On a fresh install, also
 * show the one-time wp-admin password (it's never stored, so this is the only chance to see it).
 */
function printSummary(info: DevStackInfo): void {
	const { cyan, dim, reset } = palette()
	const { port, hostname } = new URL(info.url)

	const rows: [string, string][] = [["WP Local", `http://localhost:${port}/wp-admin`]]
	if (hostname !== "localhost") rows.push(["WP Network", `${info.url}/wp-admin`])
	rows.push(["Database Connection", `127.0.0.1:${info.dbPort}`])

	const width = Math.max(...rows.map(([label]) => label.length)) + 1
	const lines = ["", ...rows.map(([label, value]) => `   ${dim}- ${`${label}:`.padEnd(width)}${reset} ${cyan}${value}${reset}`)]

	if (info.secrets) {
		lines.push(
			"",
			`   ${dim}admin login:${reset} ${info.username} / ${info.secrets.password}`,
			`   ${dim}save the password now — it's shown only once${reset}`,
		)
	} else if (info.imported) {
		lines.push("", `   ${dim}log in with your imported site's own credentials${reset}`)
	}
	if (info.seeded > 0) lines.push(`   ${dim}seeded ${info.seeded} fixture${info.seeded === 1 ? "" : "s"}${reset}`)

	process.stdout.write(`${lines.join("\n")}\n`)
}

/**
 * Dev connection keys a fresh dev install must rewrite (the rest of `.env` is untouched). The
 * production `KIZLO_WORDPRESS_*` / `KIZLO_SITE_SECRET` keys live under their own names and are never
 * touched by `kizlo dev`, so pointing them at a real site survives booting the local stack.
 */
const WP_ENV_KEYS = ["KIZLO_DEV_WORDPRESS_URL", "KIZLO_DEV_WORDPRESS_USERNAME", "KIZLO_DEV_WORDPRESS_APPLICATION_PASSWORD"] as const

/** Read a key's value from raw `.env` content (first match, trimmed); undefined when absent or empty. */
function readEnvValue(content: string, key: string): string | undefined {
	const value = content.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, "m"))?.[1]?.trim()
	return value || undefined
}

/**
 * The Kizlo backend URL from `.env` — the one key ending in `KIZLO_BACKEND_URL` (`KIZLO_BACKEND_URL`,
 * or a framework-prefixed `NEXT_PUBLIC_KIZLO_BACKEND_URL`). It's the handler mount the plugin delivers
 * webhook events to; its origin is the site's canonical URL. User-managed (init writes it), so dev
 * only reads it. Undefined before `kizlo init` has populated `.env`.
 */
function readBaseUrl(content: string): string | undefined {
	const value = content.match(/^\s*[A-Z_]*KIZLO_BACKEND_URL\s*=\s*(.*)$/m)?.[1]?.trim()
	return value || undefined
}

/**
 * Rewrite the dev WordPress connection in `.env` after a fresh install. A reset (or first boot)
 * wipes the database, so the previous application password — and possibly the port — no longer
 * match; without this the app keeps the stale credentials and REST auth fails. Only the three
 * connection keys are overwritten; everything else in `.env` is preserved, and the file is created
 * if absent. Gated by the caller on a minted `appPassword`, so a warm resume never churns it.
 *
 * `KIZLO_TARGET=dev` and `KIZLO_DEV_SITE_SECRET` are written too but kept out of the overwrite set, so a
 * value the user already set is preserved — booting the dev stack only fills them when absent. The
 * resolved dev secret (the existing one, or a freshly minted one) and the Kizlo server base URL are
 * returned so the caller can sync them into the plugin.
 */
function updateWpEnv(cfg: ResolvedDevConfig, info: DevStackInfo): { siteSecret: string; baseUrl?: string } | undefined {
	if (!info.appPassword) return undefined
	const envPath = join(cfg.configDir, ".env")
	const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : ""
	const siteSecret = readEnvValue(existing, "KIZLO_DEV_SITE_SECRET") ?? randomBytes(32).toString("hex")
	const { content } = mergeEnv(
		existing,
		{
			KIZLO_DEV_WORDPRESS_URL: info.url,
			KIZLO_DEV_WORDPRESS_USERNAME: info.username,
			KIZLO_DEV_WORDPRESS_APPLICATION_PASSWORD: info.appPassword,
			KIZLO_DEV_SITE_SECRET: siteSecret,
			KIZLO_TARGET: "dev",
		},
		new Set(WP_ENV_KEYS),
		envGroups("KIZLO_BACKEND_URL"),
	)
	writeFileSync(envPath, content)
	return { siteSecret, baseUrl: readBaseUrl(existing) }
}

/**
 * Re-point `KIZLO_DEV_WORDPRESS_URL` at the current dev URL on a warm resume, so a LAN address that
 * changed since the last session (a new DHCP lease, a different network) doesn't leave the app talking
 * to a dead IP. Only this one key is rewritten — the credentials and secret from the fresh install are
 * preserved — and it's a no-op when `.env` is absent (nothing provisioned yet) or already current.
 * The full fresh-install write goes through {@link updateWpEnv} instead; this covers the resume path it
 * skips. Returns true when it changed the file. The app still needs a restart to read the new value.
 */
function syncDevUrl(cfg: ResolvedDevConfig, url: string): boolean {
	const envPath = join(cfg.configDir, ".env")
	if (!existsSync(envPath)) return false
	const existing = readFileSync(envPath, "utf8")
	if (readEnvValue(existing, "KIZLO_DEV_WORDPRESS_URL") === url) return false
	const { content } = mergeEnv(
		existing,
		{ KIZLO_DEV_WORDPRESS_URL: url },
		new Set(["KIZLO_DEV_WORDPRESS_URL"]),
		envGroups("KIZLO_BACKEND_URL"),
	)
	writeFileSync(envPath, content)
	return true
}

/**
 * Arm the foreground teardown — call this *before* the containers start, so a cancel at
 * any point (even mid-startup, with mysql up but wordpress still booting) stops whatever
 * already came up. The teardown is owned by a detached **watchdog** process, not by this
 * one: containers belong to the Docker daemon, not our process tree, so — unlike a
 * `next dev` child server — nothing stops them automatically when we die. A dying process
 * also can't be trusted to finish async work (a closed terminal breaks its stdout
 * mid-write), so this process does no docker work on the way out. It only needs to
 * *exit*; the watchdog, watching our PID from its own session, stops the stack the moment
 * we're gone — by Ctrl+C, SIGTERM, a closed tab, SIGKILL, or a crash alike.
 *
 * We trigger that exit two ways, because neither alone is enough: signal handlers (for
 * Ctrl+C / `kill`), and an stdin/TTY-close watch (for a closed terminal, whose SIGHUP
 * an `npm`/`pnpm` wrapper silently swallows — leaving us orphaned but alive otherwise).
 */
function armForegroundTeardown(cfg: ResolvedDevConfig): void {
	registerSession(cfg.project)
	spawnWatchdog(cfg.project)

	let exiting = false
	const shutdown = (reason: string): void => {
		if (exiting) return
		exiting = true
		unregisterSession(cfg.project)
		try {
			note(`Stopping dev stack (${reason})…`)
		} catch {}
		process.exit(0)
	}

	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, () => shutdown(signal))

	if (process.stdin.isTTY) {
		process.stdin.resume()
		for (const event of ["end", "close", "error"] as const) process.stdin.on(event, () => shutdown("terminal closed"))
	}
}

/**
 * Boot the stack and run in the foreground until exit — the path behind bare
 * `kizlo dev`. Arms teardown first (so a mid-startup cancel still
 * stops partial containers), shows a timed spinner, prints the summary + stop hint, then
 * parks. A referenced timer holds the event loop open — an unresolved promise alone would
 * not, so without it Node would empty its loop and exit straight after printing.
 */
async function startForeground(cfg: ResolvedDevConfig): Promise<void> {
	await removeProjectContainers(cfg.project)

	const port = await pickStackPort(cfg.port, { fixed: cfg.portExplicit, configKey: "dev.port" })
	const dbPort = await pickStackPort(cfg.dbPort, { fixed: cfg.dbPortExplicit, host: "127.0.0.1", configKey: "dev.dbPort" })
	const ready: ResolvedDevConfig = { ...cfg, port, dbPort }
	createStack(devStack(ready))
	if (port !== cfg.port) note(`Port ${cfg.port} is in use — serving on ${port} instead.`)
	if (dbPort !== cfg.dbPort) note(`Database port ${cfg.dbPort} is in use — using ${dbPort} instead.`)

	armForegroundTeardown(ready)

	const start = Date.now()
	const creds = await withSpinner("Starting WordPress dev stack", () => bootstrapDev(ready))
	if (creds.appPassword) {
		const env = updateWpEnv(ready, creds)
		note("Updated .env with the new WordPress credentials")
		if (env) {
			const sync = await syncSiteSettings(
				{ url: creds.url, username: creds.username, password: creds.appPassword },
				{ secret: env.siteSecret, backendUrl: env.baseUrl, containerized: true },
			)
			if (!sync.ok)
				note(
					`Could not sync the site settings to WordPress (${sync.error}) — make sure the kizlo plugin is active, then set them from the Kizlo settings.`,
				)
		}
	} else if (syncDevUrl(ready, creds.url)) {
		note("Updated .env WordPress URL to the current network address — restart your app to pick it up")
	}
	printSummary(creds)

	const { green, dim, bold, reset } = palette()
	const ms = Date.now() - start
	const took = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
	process.stdout.write(
		`\n   ${dim}Press ${reset}${bold}Ctrl+C${reset}${dim} (or close the terminal) to stop the development stack${reset}\n`,
	)
	process.stdout.write(`\n ${green}✓${reset} Ready in ${took}\n\n`)

	const stopWatcher = await startWatcher(ready.configDir)
	if (stopWatcher) process.on("exit", stopWatcher)

	setInterval(() => {}, 1 << 30)
	await new Promise<never>(() => {})
}

/**
 * Run the contract watcher in the foreground until exit — the path bare `kizlo dev` takes when no
 * local dev stack is configured (a bring-your-own-WordPress project). Generates once, then watches
 * the server files and regenerates on save. Returns immediately when another watcher already holds
 * the lock; otherwise the persistent watcher keeps the process alive on its own.
 */
async function watchOnly(cwd: string): Promise<void> {
	const stop = await startWatcher(cwd)
	if (!stop) return

	process.on("exit", stop)
	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
		process.on(signal, () => {
			stop()
			process.exit(0)
		})
	}
}

/**
 * Start (or resume) the dev stack. Backs bare `kizlo dev`. Always runs in the foreground
 * and stops the stack on exit, so it never outlives the session — the subcommands
 * (`stop`/`down`/`reset`) manage everything else. Without a local dev stack configured
 * (`dev.path` unset), there's nothing to boot, so it runs the contract watcher alone.
 */
async function bringUp(): Promise<void> {
	const cwd = process.cwd()
	if (!(await hasDevStack(cwd))) {
		await watchOnly(cwd)
		return
	}

	const reaped = await reapOrphans()
	if (reaped.length) note(`Stopped ${reaped.length} orphaned dev stack${reaped.length === 1 ? "" : "s"}: ${reaped.join(", ")}`)

	const cfg = await resolveDevConfig(cwd)
	if (!cfg.wordpressPath.startsWith("..")) ensureGitignored(cfg.configDir, cfg.wordpressPath)

	await startForeground(cfg)
}

const stop = defineCommand({
	meta: { name: "stop", description: "Stop the dev stack, keeping the database volume" },
	async run() {
		if (!(await requireDevStack(process.cwd()))) return
		const { stack } = await resolve(process.cwd())
		await withSpinner("Stopping WordPress dev stack", () => stack.composeStop(), "Stack stopped (volumes kept)")
	},
})

const down = defineCommand({
	meta: { name: "down", description: "Stop and remove the dev stack containers (keeps the database and files)" },
	async run() {
		if (!(await requireDevStack(process.cwd()))) return
		const { stack } = await resolve(process.cwd())
		await withSpinner("Removing WordPress dev stack", () => stack.composeDown(), "Stack removed (database and files kept)")
	},
})

const reset = defineCommand({
	meta: { name: "reset", description: "Wipe the database and the install folder so the next `kizlo dev` rebuilds fresh" },
	async run() {
		if (!(await requireDevStack(process.cwd()))) return
		const { cfg, stack } = await resolve(process.cwd())
		await withSpinner("Wiping WordPress dev stack", () => stack.composeDown({ volumes: true }), "Local WordPress reset successfully")
		rmSync(cfg.wordpressDir, { recursive: true, force: true })
		note("Run `kizlo dev` to rebuild a fresh stack.")
	},
})

const subCommands = { stop, down, reset }

export const dev = defineCommand({
	meta: { name: "dev", description: "Run the dev stack and contract watcher (stop | down | reset)" },
	subCommands,
	run: groupDefault(Object.keys(subCommands), bringUp),
})
