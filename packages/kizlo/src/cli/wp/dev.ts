import { randomBytes } from "node:crypto"
import { existsSync, rmSync } from "node:fs"
import { networkInterfaces } from "node:os"
import { join } from "node:path"
import { WordPressService } from "../../wordpress"
import type { ResolvedDevConfig } from "../daemon/config"
import { createAdminAppPassword, seedUsers } from "./bootstrap"
import { prepareByo } from "./byo"
import { DEFAULT_PLUGINS, TEST_ADMIN } from "./constants"
import { compose, composePull, composeUp, wpCli } from "./docker"
import type { SeedContext } from "./types"
import { ensurePlugins } from "./utils"

/** What `bootstrapDev` reports back so the command can print a connection summary. */
export interface DevStackInfo {
	url: string
	username: string
	/** Host port the MySQL service is published on (loopback) for direct DB access. */
	dbPort: number
	/** True when this run hydrated an existing site from `dev.byo` (login is the imported site's). */
	imported: boolean
	/** Number of `dev.fixtures` seeded this run (0 unless a fresh stack was just seeded). */
	seeded: number
	/**
	 * The generated admin password for the wp-admin login. Present only on a fresh
	 * install — the one moment we can show it, since WordPress stores it hashed and we
	 * keep no artifact to read it back from.
	 */
	secrets?: { password: string }
	/**
	 * A freshly minted REST application password, present only on a fresh default install.
	 * The prior one (if any) died with the wiped database, so callers write this into `.env`
	 * to keep REST auth working. A BYO import keeps its own users and a warm resume keeps the
	 * existing credentials, so it's absent in those cases (nothing changed to invalidate them).
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
 * The URL the dev stack is provisioned at. We prefer the router-assigned LAN address over `localhost`
 * so it's reachable from off the host (the app in a container or on another device). Serving WordPress
 * under the request host is already handled by the container's `WORDPRESS_CONFIG_EXTRA` (it derives
 * `WP_HOME`/`WP_SITEURL` from `HTTP_HOST` per request), so this is only the address we write into `.env`
 * and print. Falls back to `localhost` when the machine is offline, so bare local dev still works.
 */
function devUrl(port: number): string {
	return `http://${lanAddress() ?? "localhost"}:${port}`
}

/**
 * Seed `dev.fixtures` into a freshly installed dev stack, reusing the test seeding
 * primitives: seed the default subscriber so `ctx.userId` exists, then run each `seed`
 * over REST. Plugins are already active (`bootstrapDev` ensures them before seeding).
 * The application password is minted only to drive seeding here — it's never printed
 * or persisted. Returns the number of fixtures seeded.
 */
async function seedDevFixtures(cfg: ResolvedDevConfig, url: string): Promise<number> {
	const userId = await seedUsers()
	const adminId = Number(await wpCli(["user", "get", TEST_ADMIN.username, "--field=ID"]))
	const password = await createAdminAppPassword("kizlo-dev-seed")
	const service = new WordPressService({ credentials: { url, username: TEST_ADMIN.username, password } })
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
 * Boot the dev stack via docker + wp-cli. A fresh stack is provisioned one of two ways:
 * a default `wp core install`, or — when `dev.byo` points at an archive — hydrated from
 * that existing site (files + database). Either way it then sets permalinks and ensures
 * the `dev.fixtures` plugins (installed sources + bind-mounted locals). An already-provisioned
 * stack is left untouched (idempotent reruns).
 *
 * Credentials are an output, not a stored file: a default fresh install mints a random
 * admin password and returns it once (to log into wp-admin); a BYO install uses the
 * imported site's own users. No application password is minted — that's a test-stack
 * concern.
 */
export async function bootstrapDev(cfg: ResolvedDevConfig): Promise<DevStackInfo> {
	const url = devUrl(cfg.port)

	const fresh = !existsSync(join(cfg.wordpressDir, "wp-includes", "version.php"))
	const byo = fresh && cfg.byo ? await prepareByo(cfg.byo, cfg.wordpressDir, cfg.configDir) : undefined

	// A fresh install copies WordPress out of the `wordpress:latest` image into the empty bind
	// mount, so the version we get is whatever that tag resolves to locally. Docker won't re-pull a
	// cached `latest`, which would pin new installs to a stale WordPress — so refresh it here, but
	// only on a fresh install (a warm resume reuses the existing files and never pays this cost).
	// Docker's own layer cache keeps this a cheap digest check when the tag hasn't moved, and it's
	// best-effort: an offline pull failure falls back to the cached image so dev still works.
	if (fresh && !byo) await composePull(["wordpress", "wp-cli"]).catch(() => undefined)

	await composeUp()

	const installed = (await compose(["exec", "-T", "wp-cli", "wp", "core", "is-installed"])).code === 0
	let password: string | undefined
	let imported = false

	if (!installed && byo) {
		imported = true
		if (byo.prefix !== "wp_") await wpCli(["config", "set", "table_prefix", byo.prefix, "--type=variable"])
		const imp = await compose(["exec", "-T", "mysql", "mysql", "-uwordpress", "-pwppass", "wordpress"], { inputFile: byo.sqlPath })
		if (imp.code !== 0) throw new Error(`importing dev.byo database failed:\n${imp.stderr || imp.stdout}`)
		rmSync(byo.sqlPath, { force: true })
		const oldUrl = await wpCli(["option", "get", "siteurl"]).catch(() => "")
		if (oldUrl && oldUrl !== url) {
			await wpCli(["search-replace", oldUrl, url, "--all-tables", "--skip-columns=guid", "--report-changed-only"])
		}
		await wpCli(["rewrite", "flush", "--hard"])
	} else if (!installed) {
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

	await ensurePlugins([...DEFAULT_PLUGINS, ...cfg.fixtures.flatMap((fixture) => fixture.plugins ?? [])])

	const seeded = !installed && !byo && cfg.fixtures.length ? await seedDevFixtures(cfg, url) : 0

	const appPassword = password ? await createAdminAppPassword("kizlo-dev") : undefined

	return {
		url,
		username: TEST_ADMIN.username,
		dbPort: cfg.dbPort,
		imported,
		seeded,
		appPassword,
		secrets: password ? { password } : undefined,
	}
}
