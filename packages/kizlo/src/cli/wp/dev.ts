import { randomBytes } from "node:crypto"
import { existsSync } from "node:fs"
import { networkInterfaces } from "node:os"
import { join } from "node:path"
import { WordPressTransport } from "../../wordpress"
import type { ResolvedDevConfig } from "../daemon/config"
import { log } from "../daemon/logger"
import { createAdminAppPassword, seedUsers } from "./bootstrap"
import { DEFAULT_PLUGINS, TEST_ADMIN } from "./constants"
import { compose, composePull, composeUp, wpCli, wpEval } from "./docker"
import type { SeedContext } from "./types"
import { ensurePlugins, settleFixtures } from "./utils"
import { warnVersionDrift } from "./version"

/** What `bootstrapDev` reports back so the command can print a connection summary. */
export interface DevStackInfo {
	url: string
	username: string
	/** Host port the MySQL service is published on (loopback) for direct DB access. */
	dbPort: number
	/** Number of `dev.fixtures` seeded this run (0 unless a fresh stack was just seeded). */
	seeded: number
	/**
	 * The generated admin password for the wp-admin login. Present only on a fresh
	 * install — the one moment we can show it, since WordPress stores it hashed and we
	 * keep no artifact to read it back from.
	 */
	secrets?: { password: string }
	/**
	 * A freshly minted REST application password, present only on a fresh install. The prior
	 * one (if any) died with the wiped database, so callers write this into `.env` to keep REST
	 * auth working. A warm resume keeps the existing credentials, so it's absent then (nothing
	 * changed to invalidate them).
	 */
	appPassword?: string
}

/** A strong random admin password (144 bits, URL/JSON/CLI-safe characters). */
function generatePassword(): string {
	return randomBytes(18).toString("base64url")
}

/** First non-internal IPv4 address — the router-assigned LAN address (undefined when offline). */
function lanAddress(): string | undefined {
	for (const ifaces of Object.values(networkInterfaces())) {
		for (const iface of ifaces ?? []) {
			if (iface.family === "IPv4" && !iface.internal) return iface.address
		}
	}
	return undefined
}

/**
 * The URL local WordPress is provisioned at. We prefer the router-assigned LAN address over `localhost`
 * so it's reachable from off the host (the app in a container or on another device). Serving WordPress
 * under the request host is already handled by the container's `WORDPRESS_CONFIG_EXTRA` (it derives
 * `WP_HOME`/`WP_SITEURL` from `HTTP_HOST` per request), so this is only the address we write into `.env`
 * and print. Falls back to `localhost` when the machine is offline, so bare local dev still works.
 */
function devUrl(port: number): string {
	return `http://${lanAddress() ?? "localhost"}:${port}`
}

/**
 * Seed `dev.fixtures` into freshly installed local WordPress, reusing the test seeding
 * primitives: seed the default subscriber so `ctx.userId` exists, then run each `seed`
 * over REST. Plugins are already active (`bootstrapDev` ensures them before seeding).
 * The application password is minted only to drive seeding here — it's never printed
 * or persisted. Returns the number of fixtures seeded.
 */
async function seedDevFixtures(cfg: ResolvedDevConfig, url: string): Promise<number> {
	const userId = await seedUsers()
	const adminId = Number(await wpCli(["user", "get", TEST_ADMIN.username, "--field=ID"]))
	const password = await createAdminAppPassword("kizlo-dev-seed")
	const service = new WordPressTransport({ credentials: { url, username: TEST_ADMIN.username, password } })
	const ctx: SeedContext = { service, adminId, userId }

	let seeded = 0
	for (const fixture of cfg.fixtures) {
		if (fixture.seed) {
			await fixture.seed(ctx)
			seeded++
		}
	}
	return seeded
}

/**
 * Boot local WordPress via docker + wp-cli. A fresh install is provisioned with a default
 * `wp core install`, then sets permalinks and ensures the `dev.fixtures` plugins (installed
 * sources + bind-mounted locals). An already-provisioned install is left untouched
 * (idempotent reruns).
 *
 * Credentials are an output, not a stored file: a fresh install mints a random admin
 * password and returns it once (to log into wp-admin). No application password is minted —
 * that's a test concern.
 */
export async function bootstrapDev(cfg: ResolvedDevConfig): Promise<DevStackInfo> {
	const url = devUrl(cfg.port)

	const fresh = !existsSync(join(cfg.wordpressDir, "wp-includes", "version.php"))

	// A fresh install copies WordPress out of the configured image into the empty bind mount, so
	// the version we get is whatever that tag resolves to locally. Docker won't re-pull a cached
	// tag, which for a moving one like `latest` would pin new installs to a stale WordPress. So
	// refresh it here, but only on a fresh install (a warm resume reuses the existing files and
	// never pays this cost). Docker's own layer cache keeps this a cheap digest check whenever the
	// tag hasn't moved, which for a pinned one is always. Best-effort: an offline pull failure
	// falls back to the cached image so dev still works.
	if (fresh) await composePull(["wordpress", "wp-cli"]).catch(() => undefined)

	await composeUp()

	const installed = (await compose(["exec", "-T", "wp-cli", "wp", "core", "is-installed"])).code === 0
	let password: string | undefined

	if (!installed) {
		password = generatePassword()
		await wpCli([
			"core",
			"install",
			`--url=${url}`,
			"--title=Kizlo Dev",
			`--admin_user=${TEST_ADMIN.username}`,
			`--admin_password=${password}`,
			`--admin_email=${TEST_ADMIN.email}`,
			"--skip-email",
		])
		await wpCli(["rewrite", "structure", "/%postname%/", "--hard"])
	}

	// Only a warm install can disagree: a fresh one is copied out of the configured image above.
	if (installed) {
		await warnVersionDrift({
			wpCli,
			tag: cfg.wordpressTag,
			resetCommand: "kizlo dev reset",
			warn: (message) => log.warn(message),
		})
	}

	await ensurePlugins([...DEFAULT_PLUGINS, ...cfg.fixtures.flatMap((fixture) => fixture.plugins ?? [])])
	await settleFixtures(cfg.fixtures, { wpCli, wpEval })

	const seeded = !installed && cfg.fixtures.length ? await seedDevFixtures(cfg, url) : 0

	const appPassword = password ? await createAdminAppPassword("kizlo-dev") : undefined

	return {
		url,
		username: TEST_ADMIN.username,
		dbPort: cfg.dbPort,
		seeded,
		appPassword,
		secrets: password ? { password } : undefined,
	}
}
