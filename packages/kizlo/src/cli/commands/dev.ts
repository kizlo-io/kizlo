import { randomBytes } from "node:crypto"
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { networkInterfaces } from "node:os"
import { join } from "node:path"
import { defineCommand } from "citty"
import { palette, printBanner } from "../banner"
import { type ResolvedDevConfig, resolveDevConfig } from "../daemon/config"
import { startWatcher } from "../daemon/watch"
import { ensureGitignored, envGroups, getVersion, groupDefault, mergeEnv, pickStackPort, withSpinner } from "../utils"
import { bootstrapDev, type DevStackInfo } from "../wp/dev"
import { createStack, type DockerStack } from "../wp/docker"
import { reapOrphans, registerSession, removeProjectContainers, spawnWatchdog, unregisterSession } from "../wp/session"
import { syncSiteSettings } from "../wp/settings"
import { devStack } from "../wp/stack"

async function resolve(cwd: string): Promise<{ cfg: ResolvedDevConfig; stack: DockerStack }> {
	const cfg = await resolveDevConfig(cwd)
	return { cfg, stack: createStack(devStack(cfg)) }
}

/** A dim, untagged one-liner (no consola timestamp) for the clean dev output. */
function note(text: string): void {
	const { dim, reset } = palette()
	process.stdout.write(`   ${dim}${text}${reset}\n`)
}

/** First non-internal IPv4 address, for the LAN-reachable "Network" URL (undefined when offline). */
function lanAddress(): string | undefined {
	for (const ifaces of Object.values(networkInterfaces())) {
		for (const iface of ifaces ?? []) {
			if (iface.family === "IPv4" && !iface.internal) return iface.address
		}
	}
	return undefined
}

/**
 * Print the connection summary as an aligned, Next.js-style block. Shows the wp-admin
 * URL on localhost ("Local") and — when a LAN address exists — on the network, so the
 * stack can be opened from other devices. On a fresh install, also show the one-time
 * wp-admin password (it's never stored, so this is the only chance to see it).
 */
function printSummary(info: DevStackInfo): void {
	const { cyan, dim, reset } = palette()
	const port = new URL(info.url).port
	const lan = lanAddress()

	const rows: [string, string][] = [["WP Local", `${info.url}/wp-admin`]]
	if (lan) rows.push(["WP Network", `http://${lan}:${port}/wp-admin`])
	rows.push(["Database Connection", `127.0.0.1:${info.dbPort}`])

	const width = Math.max(...rows.map(([label]) => label.length)) + 1 // + the colon
	const lines = ["", ...rows.map(([label, value]) => `   ${dim}- ${`${label}:`.padEnd(width)}${reset} ${cyan}${value}${reset}`)]

	// On a fresh install show the one-time password; on a returning install there's
	// nothing new to say (the stop hint after the summary is the only trailing line).
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
	// Preserve a user-set KIZLO_DEV_SITE_SECRET; mint one only when the dev set has none yet.
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
		// dev never writes the backend URL itself; the key is only needed to label its (skipped) group.
		envGroups("KIZLO_BACKEND_URL"),
	)
	writeFileSync(envPath, content)
	return { siteSecret, baseUrl: readBaseUrl(existing) }
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
		// Best effort, fully synchronous: no docker, no spinner — those can hang or throw
		// on a broken pipe. The watchdog does the actual stop once we're gone.
		try {
			note(`Stopping dev stack (${reason})…`)
		} catch {
			// stdout already gone (closed terminal) — nothing to print to.
		}
		process.exit(0)
	}

	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, () => shutdown(signal))

	// Closing the terminal/tab tears down the controlling TTY even when its SIGHUP never
	// reaches us; reading stdin surfaces that as end/close/error. Only meaningful for an
	// interactive TTY — a piped or non-interactive stdin would end at once and exit early.
	if (process.stdin.isTTY) {
		process.stdin.resume()
		for (const event of ["end", "close", "error"] as const) process.stdin.on(event, () => shutdown("terminal closed"))
	}
}

/**
 * Boot the stack and run in the foreground until exit — the shared path behind bare
 * `kizlo dev` and `kizlo dev reset`. Arms teardown first (so a mid-startup cancel still
 * stops partial containers), shows a timed spinner, prints the summary + stop hint, then
 * parks. A referenced timer holds the event loop open — an unresolved promise alone would
 * not, so without it Node would empty its loop and exit straight after printing.
 */
async function startForeground(cfg: ResolvedDevConfig): Promise<void> {
	// Clear any leftover containers for this project (a crashed session, a second
	// invocation) so `up` builds fresh ones rather than reconciling a stale — often
	// unhealthy — mysql, the reconcile that intermittently fails with "exited (137)".
	// Volumes survive, so the DB and install are reused.
	await removeProjectContainers(cfg.project)

	// Pick host ports that are actually free, preferring the configured/default values.
	// A port already held (by another stack or an unrelated server) degrades to the next
	// free one instead of failing the whole `up`. WP publishes on all interfaces, MySQL on
	// loopback — so each is probed on the host it's bound to. Resolving the ports here, then
	// (re)activating the stack on them, keeps the override + bootstrap URL in agreement.
	const port = await pickStackPort(cfg.port, { fixed: cfg.portExplicit, configKey: "dev.port" })
	const dbPort = await pickStackPort(cfg.dbPort, { fixed: cfg.dbPortExplicit, host: "127.0.0.1", configKey: "dev.dbPort" })
	const ready: ResolvedDevConfig = { ...cfg, port, dbPort }
	createStack(devStack(ready))
	if (port !== cfg.port) note(`Port ${cfg.port} is in use — serving on ${port} instead.`)
	if (dbPort !== cfg.dbPort) note(`Database port ${cfg.dbPort} is in use — using ${dbPort} instead.`)

	armForegroundTeardown(ready)

	const start = Date.now()
	const creds = await withSpinner("Starting WordPress dev stack", () => bootstrapDev(ready))
	// A fresh install (first boot or `reset`) returns new credentials; sync them into `.env`
	// so the app connects to the rebuilt site instead of failing on the wiped DB's old ones.
	if (creds.appPassword) {
		const env = updateWpEnv(ready, creds)
		note("Updated .env with the new WordPress credentials")
		// Push the dev site settings into the freshly provisioned plugin: the shared secret (so webhook
		// signing works) plus the Kizlo server's URL/backend_url (so the plugin can reach it to deliver
		// events). backend_url is the base URL the handler is mounted at; url is its origin. The kizlo
		// core plugin is always active in the dev stack, so the route exists; warn (don't fail) if the
		// call doesn't land. A warm resume returns no appPassword, so this never churns.
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
	}
	printSummary(creds)

	// Fold the contract watcher into `kizlo dev` so a single terminal both runs the
	// WordPress stack and regenerates the contract on save. Skips silently when a
	// standalone `kizlo watch` already holds the lock; its stop() releases that lock
	// on exit (release is synchronous, so the process-exit handler is enough).
	const stopWatcher = await startWatcher(ready.configDir)
	if (stopWatcher) process.on("exit", stopWatcher)

	const { green, dim, bold, reset } = palette()
	const ms = Date.now() - start
	const took = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
	process.stdout.write(
		`\n   ${dim}Press ${reset}${bold}Ctrl+C${reset}${dim} (or close the terminal) to stop the development stack${reset}\n`,
	)
	process.stdout.write(`\n ${green}✓${reset} Ready in ${took}\n\n`)

	setInterval(() => {}, 1 << 30)
	await new Promise<never>(() => {})
}

/**
 * Start (or resume) the dev stack. Backs bare `kizlo dev`. Always runs in the foreground
 * and stops the stack on exit, so it never outlives the session — the subcommands
 * (`stop`/`down`/`reset`) manage everything else.
 */
async function bringUp(): Promise<void> {
	// Logo first, so the terminal shows something the instant the command runs.
	printBanner(getVersion())

	// Reap stacks orphaned by a previously crashed/killed foreground session before
	// starting a new one, so leaked containers from any project self-heal here.
	const reaped = await reapOrphans()
	if (reaped.length) note(`Stopped ${reaped.length} orphaned dev stack${reaped.length === 1 ? "" : "s"}: ${reaped.join(", ")}`)

	// startForeground picks the ports and activates the stack; here we only need the config.
	const cfg = await resolveDevConfig(process.cwd())
	// The install folder holds thousands of files; keep it out of git, but it stays
	// visibly named at the path the user chose so they know it's their dev site.
	if (!cfg.wordpressPath.startsWith("..")) ensureGitignored(cfg.configDir, cfg.wordpressPath)

	await startForeground(cfg)
}

const stop = defineCommand({
	meta: { name: "stop", description: "Stop the dev stack, keeping the database volume" },
	async run() {
		const { stack } = await resolve(process.cwd())
		await withSpinner("Stopping WordPress dev stack", () => stack.composeStop(), "Stack stopped (volumes kept)")
	},
})

const down = defineCommand({
	// No `-v`: the dev DB is the only volume, so dropping it alone leaves the host files
	// without a database — an inconsistent half-install. `reset` is the destructive path
	// (it wipes files and DB together); `down` only removes the containers.
	meta: { name: "down", description: "Stop and remove the dev stack containers (keeps the database and files)" },
	async run() {
		const { stack } = await resolve(process.cwd())
		await withSpinner("Removing WordPress dev stack", () => stack.composeDown(), "Stack removed (database and files kept)")
	},
})

const reset = defineCommand({
	meta: { name: "reset", description: "Wipe the database and the install folder, then rebuild fresh" },
	async run() {
		printBanner(getVersion())
		const { cfg, stack } = await resolve(process.cwd())
		await withSpinner("Wiping WordPress dev stack", () => stack.composeDown({ volumes: true }), "Stack wiped")
		// The install lives on the host, not in a volume, so clear it by hand for a
		// genuinely fresh rebuild (the WordPress image repopulates core on next up).
		rmSync(cfg.wordpressDir, { recursive: true, force: true })
		// Like bare `kizlo dev`, rebuild then run foreground so the fresh stack doesn't leak.
		await startForeground(cfg)
	},
})

const subCommands = { stop, down, reset }

export const dev = defineCommand({
	meta: { name: "dev", description: "Manage the local WordPress dev stack (stop | down | reset)" },
	subCommands,
	// Bare `kizlo dev` starts the stack (foreground, stops on exit); the subcommands manage its lifecycle.
	run: groupDefault(Object.keys(subCommands), bringUp),
})
