import { randomBytes } from "node:crypto"
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { defineCommand } from "citty"
import { palette } from "../banner"
import { type ResolvedDevConfig, resolveDevConfig, usesLocalWordPress } from "../daemon/config"
import { log } from "../daemon/logger"
import { watchReload } from "../daemon/reload"
import { startWatcher } from "../daemon/watch"
import { DEFAULT_ENV_KEYS, ensureGitignored, envGroups, groupDefault, mergeEnv, pickStackPort, withSpinner } from "../utils"
import { bootstrapDev, type DevStackInfo } from "../wp/dev"
import { createStack, type DockerStack, dockerHint, dockerStatus } from "../wp/docker"
import { reapOrphans, registerSession, removeProjectContainers, spawnWatchdog, unregisterSession } from "../wp/session"
import { syncSiteSettings } from "../wp/settings"
import { devStack } from "../wp/stack"
import { findConfigDir } from "../wp/utils"

async function resolve(cwd: string): Promise<{ cfg: ResolvedDevConfig; stack: DockerStack }> {
	const cfg = await resolveDevConfig(cwd)
	return { cfg, stack: createStack(devStack(cfg)) }
}

/**
 * The lifecycle subcommands (`stop`/`reset`) only act on local WordPress. A project pointing at its
 * own WordPress (no `dev.local`) has nothing to manage, so print a plain note and exit cleanly. Returns
 * true when local WordPress is configured and the caller may proceed.
 */
async function requireLocalWordPress(cwd: string): Promise<boolean> {
	if (await usesLocalWordPress(cwd)) return true
	note("This project doesn't run local WordPress — set `dev.local: true` in kizlo.config.ts to add it.")
	return false
}

/** A dim, untagged one-liner (no consola timestamp) for the clean dev output. */
function note(text: string): void {
	const { dim, reset } = palette()
	process.stdout.write(`   ${dim}${text}${reset}\n`)
}

/**
 * Print the connection summary as an aligned, Next.js-style block. Shows the wp-admin URL on
 * the loopback ("Local") and — when local WordPress is installed on a LAN address rather than
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
	}
	if (info.seeded > 0) lines.push(`   ${dim}seeded ${info.seeded} fixture${info.seeded === 1 ? "" : "s"}${reset}`)

	process.stdout.write(`${lines.join("\n")}\n`)
}

/**
 * Local-WordPress connection keys a fresh install must rewrite (the rest of `.env` is untouched). The
 * remote `KIZLO_WP_*` / `KIZLO_WP_SECRET` keys live under their own names and are never
 * touched by `kizlo dev`, so pointing them at a real site survives booting local WordPress.
 */
const WP_ENV_KEYS = ["KIZLO_LOCAL_WP_URL", "KIZLO_LOCAL_WP_USERNAME", "KIZLO_LOCAL_WP_APP_PASSWORD"] as const

/** Read a key's value from raw `.env` content (first match, trimmed); undefined when absent or empty. */
function readEnvValue(content: string, key: string): string | undefined {
	const value = content.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, "m"))?.[1]?.trim()
	return value || undefined
}

/**
 * The Kizlo backend URL from `.env` — the one key ending in `KIZLO_API_URL` (`KIZLO_API_URL`,
 * or a framework-prefixed `NEXT_PUBLIC_KIZLO_API_URL`). It's the handler mount the plugin delivers
 * webhook events to; its origin is the site's canonical URL. User-managed (init writes it), so dev
 * only reads it. Undefined before `kizlo init` has populated `.env`.
 */
function readBaseUrl(content: string): string | undefined {
	const value = content.match(/^\s*[A-Z_]*KIZLO_API_URL\s*=\s*(.*)$/m)?.[1]?.trim()
	return value || undefined
}

/**
 * Rewrite the local WordPress connection in `.env` after a fresh install. A reset (or first boot)
 * wipes the database, so the previous application password — and possibly the port — no longer
 * match; without this the app keeps the stale credentials and REST auth fails. Only the three
 * connection keys are overwritten; everything else in `.env` is preserved, and the file is created
 * if absent. Gated by the caller on a minted `appPassword`, so a warm resume never churns it.
 *
 * `KIZLO_CONNECT=local` and `KIZLO_LOCAL_WP_SECRET` are written too but kept out of the overwrite set,
 * so a value the user already set is preserved — booting local WordPress only fills them when absent.
 * The resolved local secret (the existing one, or a freshly minted one) and the Kizlo server base URL
 * are returned so the caller can sync them into the plugin.
 */
function updateWpEnv(cfg: ResolvedDevConfig, info: DevStackInfo): { siteSecret: string; baseUrl?: string } | undefined {
	if (!info.appPassword) return undefined
	const envPath = join(cfg.configDir, ".env")
	const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : ""
	const siteSecret = readEnvValue(existing, "KIZLO_LOCAL_WP_SECRET") ?? randomBytes(32).toString("hex")
	const { content } = mergeEnv(
		existing,
		{
			KIZLO_LOCAL_WP_URL: info.url,
			KIZLO_LOCAL_WP_USERNAME: info.username,
			KIZLO_LOCAL_WP_APP_PASSWORD: info.appPassword,
			KIZLO_LOCAL_WP_SECRET: siteSecret,
			KIZLO_CONNECT: "local",
		},
		new Set(WP_ENV_KEYS),
		envGroups(DEFAULT_ENV_KEYS),
	)
	writeFileSync(envPath, content)
	return { siteSecret, baseUrl: readBaseUrl(existing) }
}

/**
 * Re-point `KIZLO_LOCAL_WP_URL` at the current URL on a warm resume, so a LAN address that
 * changed since the last session (a new DHCP lease, a different network) doesn't leave the app talking
 * to a dead IP. Only this one key is rewritten — the credentials and secret from the fresh install are
 * preserved — and it's a no-op when `.env` is absent (nothing provisioned yet) or already current.
 * The full fresh-install write goes through {@link updateWpEnv} instead; this covers the resume path it
 * skips. Returns true when it changed the file. The app still needs a restart to read the new value.
 */
export function syncLocalUrl(configDir: string, url: string): boolean {
	const envPath = join(configDir, ".env")
	if (!existsSync(envPath)) return false
	const existing = readFileSync(envPath, "utf8")
	if (readEnvValue(existing, "KIZLO_LOCAL_WP_URL") === url) return false
	const { content } = mergeEnv(existing, { KIZLO_LOCAL_WP_URL: url }, new Set(["KIZLO_LOCAL_WP_URL"]), envGroups(DEFAULT_ENV_KEYS))
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
 * *exit*; the watchdog, watching our PID from its own session, stops it the moment
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
			note(`Stopping local WordPress (${reason})…`)
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
 * Bring the dev stack's containers up for `cfg`: clear any stale containers, resolve the published
 * ports (stepping off a collision unless the port is pinned in config), write the compose files, and
 * note any port that moved. Returns `cfg` with the resolved ports — the shape the rest of the boot
 * and the teardown work against. Shared by the first boot and every reload reboot, so a changed
 * `dev.port` in `kizlo.config.ts` is re-resolved the same way each time.
 */
async function prepareStack(cfg: ResolvedDevConfig): Promise<ResolvedDevConfig> {
	await removeProjectContainers(cfg.project)

	const port = await pickStackPort(cfg.port, { fixed: cfg.portExplicit, configKey: "dev.port" })
	const dbPort = await pickStackPort(cfg.dbPort, { fixed: cfg.dbPortExplicit, host: "127.0.0.1", configKey: "dev.dbPort" })
	const ready: ResolvedDevConfig = { ...cfg, port, dbPort }
	createStack(devStack(ready))
	if (port !== cfg.port) note(`Port ${cfg.port} is in use — serving on ${port} instead.`)
	if (dbPort !== cfg.dbPort) note(`Database port ${cfg.dbPort} is in use — using ${dbPort} instead.`)
	return ready
}

/**
 * After a boot, sync the fresh credentials (or the current LAN URL) into `.env` and the plugin, print
 * the connection summary, and print the timed ready line. `reloaded` swaps the wording and drops the
 * one-time Ctrl+C hint. `start` is when the boot began, so the timing spans the whole reboot including
 * the spinner. The `.env` writes here are why the caller pauses the reload watcher around a reboot.
 */
async function report(cfg: ResolvedDevConfig, creds: DevStackInfo, reloaded: boolean, start: number): Promise<void> {
	if (creds.appPassword) {
		const env = updateWpEnv(cfg, creds)
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
	} else if (syncLocalUrl(cfg.configDir, creds.url)) {
		note("Updated .env WordPress URL to the current network address — restart your app to pick it up")
	}
	printSummary(creds)

	const { green, dim, bold, reset } = palette()
	const ms = Date.now() - start
	const took = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
	if (!reloaded)
		process.stdout.write(`\n   ${dim}Press ${reset}${bold}Ctrl+C${reset}${dim} (or close the terminal) to stop local WordPress${reset}\n`)
	process.stdout.write(`\n ${green}✓${reset} ${reloaded ? "Reloaded" : "Ready"} in ${took}\n\n`)
}

/**
 * Boot local WordPress for an already-prepared `cfg` (ports resolved, teardown armed) behind a spinner,
 * then report. The first-boot path only — reboots go through {@link rebootStack}, which also folds the
 * prepare step under the spinner.
 */
async function bootAndReport(cfg: ResolvedDevConfig): Promise<void> {
	const start = Date.now()
	const creds = await withSpinner("Starting local WordPress", () => bootstrapDev(cfg))
	await report(cfg, creds, false, start)
}

/**
 * Reboot the whole stack in place after a config/env change: re-resolve the config, recreate the
 * containers, and boot WordPress — all behind a single spinner labelled with the file that changed, so
 * there's no loaderless gap between detecting the change and the boot. Teardown is already armed from
 * the first boot, so this never re-arms. Returns the freshly resolved config (ports may have moved) so
 * the caller can re-target its watchers.
 */
async function rebootStack(cwd: string, label: string): Promise<ResolvedDevConfig> {
	const start = Date.now()
	const { ready, creds } = await withSpinner(label, async () => {
		const ready = await prepareStack(await resolveDevConfig(cwd))
		return { ready, creds: await bootstrapDev(ready) }
	})
	await report(ready, creds, true, start)
	return ready
}

/**
 * Boot local WordPress and run in the foreground until exit — the path behind bare `kizlo dev`. Arms
 * teardown first (so a mid-startup cancel still stops partial containers), boots and prints the
 * summary, then parks. While parked it watches `.env` and `kizlo.config.*`: a change reboots the whole
 * stack in place so a new port, connection, or fixture takes effect without rerunning the command. The
 * reboot runs in the same process — the watchdog and session keep watching this PID throughout — and is
 * guarded so the credential/URL writes it makes to `.env` don't trigger another reboot. A referenced
 * timer holds the event loop open — an unresolved promise alone would not, so without it Node would
 * empty its loop and exit straight after printing.
 */
async function startForeground(cfg: ResolvedDevConfig): Promise<void> {
	const cwd = process.cwd()
	let ready = await prepareStack(cfg)
	armForegroundTeardown(ready)
	await bootAndReport(ready)

	let stopContract = await startWatcher(ready.configDir)

	let reloading = false
	const reload = async (changed: string): Promise<void> => {
		if (reloading) return
		reloading = true
		try {
			stopContract?.()
			ready = await rebootStack(cwd, `${changed} changed — restarting the session`)
			stopContract = await startWatcher(ready.configDir)
		} catch (error) {
			log.error("Failed to reload the dev session:", error)
		} finally {
			setTimeout(() => {
				reloading = false
			}, 500)
		}
	}

	const stopReload = watchReload(ready.configDir, (changed) => void reload(changed))
	process.on("exit", () => {
		stopContract?.()
		stopReload()
	})

	setInterval(() => {}, 1 << 30)
	await new Promise<never>(() => {})
}

/**
 * Run the contract watcher in the foreground until exit — the path bare `kizlo dev` takes when local
 * WordPress isn't configured (a project pointing at its own WordPress). Generates once, then watches
 * the server files and regenerates on save. It also watches `.env` and `kizlo.config.*` and restarts
 * the watcher on a change, so a new server dir or env value is picked up the same way the local path
 * reboots its stack. Returns immediately when another watcher already holds the lock; otherwise the
 * persistent watcher keeps the process alive on its own.
 */
async function watchOnly(cwd: string): Promise<void> {
	let stop = await startWatcher(cwd)
	if (!stop) return

	let reloading = false
	const reload = async (): Promise<void> => {
		if (reloading) return
		reloading = true
		try {
			stop?.()
			stop = await startWatcher(cwd)
		} finally {
			setTimeout(() => {
				reloading = false
			}, 300)
		}
	}
	const stopReload = watchReload(findConfigDir(cwd), () => void reload())

	const shutdown = (): void => {
		stop?.()
		stopReload()
	}
	process.on("exit", shutdown)
	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
		process.on(signal, () => {
			shutdown()
			process.exit(0)
		})
	}
}

/**
 * Start (or resume) local WordPress. Backs bare `kizlo dev`. Always runs in the foreground and stops
 * it on exit, so it never outlives the session — the subcommands (`stop`/`reset`) manage everything
 * else. Without local WordPress configured there's nothing to boot, so it runs the contract watcher
 * alone.
 */
async function bringUp(): Promise<void> {
	const cwd = process.cwd()
	if (!(await usesLocalWordPress(cwd))) {
		note("This project doesn't run local WordPress — running the contract watcher only. Set `dev.local` in kizlo.config.ts to add it.")
		await watchOnly(cwd)
		return
	}

	const status = await dockerStatus()
	if (status !== "running") {
		note(dockerHint(status))
		process.exit(1)
	}

	const reaped = await reapOrphans()
	if (reaped.length) note(`Stopped ${reaped.length} orphaned local WordPress${reaped.length === 1 ? "" : "s"}: ${reaped.join(", ")}`)

	const cfg = await resolveDevConfig(cwd)
	ensureGitignored(cfg.configDir, ".kizlo/")

	await startForeground(cfg)
}

const stop = defineCommand({
	meta: { name: "stop", description: "Stop local WordPress, keeping the database volume" },
	async run() {
		if (!(await requireLocalWordPress(process.cwd()))) return
		const { stack } = await resolve(process.cwd())
		await withSpinner("Stopping local WordPress", () => stack.composeStop(), "Local WordPress stopped (volumes kept)")
	},
})

const reset = defineCommand({
	meta: { name: "reset", description: "Wipe the database and the install folder so the next `kizlo dev` rebuilds fresh" },
	async run() {
		if (!(await requireLocalWordPress(process.cwd()))) return
		const { cfg, stack } = await resolve(process.cwd())
		await withSpinner("Wiping local WordPress", () => stack.composeDown({ volumes: true }), "Local WordPress reset successfully")
		rmSync(cfg.wordpressDir, { recursive: true, force: true })
		note("Run `kizlo dev` to rebuild fresh.")
	},
})

const subCommands = { stop, reset }

export const dev = defineCommand({
	meta: { name: "dev", description: "Run local WordPress and the contract watcher (stop | reset)" },
	subCommands,
	run: groupDefault(Object.keys(subCommands), bringUp),
})
