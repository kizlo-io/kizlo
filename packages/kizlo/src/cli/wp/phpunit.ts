import { existsSync } from "node:fs"
import { basename, isAbsolute, resolve } from "node:path"
import type { ResolvedTestConfig } from "../daemon/config"
import { log } from "../daemon/logger"
import { compose } from "./docker"
import { isLocalPlugin } from "./types"

/** Where the served WordPress core lives inside the `wordpress` container. */
const WP_ROOT = "/var/www/html"
const PLUGINS_DIR = `${WP_ROOT}/wp-content/plugins`

/** Isolated database the PHP suite runs against — never the served site's DB. */
const TEST_DB = "wordpress_test"
/** Root creds from the compose file, used only to create the DB and grant access. */
const MYSQL_ROOT_PASSWORD = "rootpass"
/** The app user the served site already connects as; the suite reuses it. */
const MYSQL_USER = "wordpress"

/** A phpunit target: the container dir to run in, keyed off a bind-mounted local plugin. */
interface PhpunitTarget {
	/** Plugin dir basename — the slug the mount lands at under `wp-content/plugins`. */
	slug: string
	/** Absolute container path to run phpunit from. */
	containerDir: string
}

/**
 * The bind-mounted local plugins that carry a `phpunit.xml` (or `.dist`), resolved
 * to their in-container plugin dir. Checked on the host (where the source lives),
 * run in the container (where WordPress lives) — so this works identically for a
 * consumer whose own plugin is mounted while kizlo comes from a release.
 */
function phpunitTargets(cfg: ResolvedTestConfig): PhpunitTarget[] {
	const seen = new Set<string>()
	const targets: PhpunitTarget[] = []

	for (const plugin of cfg.fixtures.flatMap((fixture) => fixture.plugins ?? [])) {
		if (!isLocalPlugin(plugin)) continue
		const hostDir = isAbsolute(plugin.path) ? plugin.path : resolve(cfg.configDir, plugin.path)
		const slug = basename(hostDir)
		if (seen.has(slug)) continue
		seen.add(slug)

		const hasConfig = existsSync(resolve(hostDir, "phpunit.xml")) || existsSync(resolve(hostDir, "phpunit.xml.dist"))
		if (!hasConfig) continue

		// A phpunit config alone isn't enough: the runner invokes `vendor/bin/phpunit` and
		// exports the wp-phpunit test library from the plugin's `vendor/`. If a plugin ships
		// a config but its dev deps aren't installed (e.g. `composer install --no-dev`), skip
		// it with a clear note rather than letting `php vendor/bin/phpunit` fail with a raw
		// error and fold a spurious failure into `kizlo test`.
		if (!existsSync(resolve(hostDir, "vendor/bin/phpunit"))) {
			log.warn(
				`${slug} has a phpunit config but no vendor/bin/phpunit — run \`composer install\` with dev dependencies to run its PHP tests. Skipping.`,
			)
			continue
		}

		targets.push({ slug, containerDir: `${PLUGINS_DIR}/${slug}` })
	}

	return targets
}

/**
 * Create the isolated `wordpress_test` database in the `mysql` service and grant the
 * app user full access to it. Idempotent (`IF NOT EXISTS` + a re-runnable grant), so
 * it can run on every `kizlo test` next to seeding without a guard.
 */
export async function provisionTestDb(): Promise<void> {
	const sql = [
		`CREATE DATABASE IF NOT EXISTS ${TEST_DB};`,
		`GRANT ALL PRIVILEGES ON ${TEST_DB}.* TO '${MYSQL_USER}'@'%';`,
		"FLUSH PRIVILEGES;",
	].join(" ")

	const res = await compose(["exec", "-T", "mysql", "mysql", `-uroot`, `-p${MYSQL_ROOT_PASSWORD}`, "-e", sql])
	if (res.code !== 0) throw new Error(`Failed to provision the ${TEST_DB} database:\n${res.stderr || res.stdout}`)
}

/** Run one plugin's phpunit suite inside the `wordpress` container; resolve its exit code. */
async function runTarget(target: PhpunitTarget): Promise<number> {
	const wpPhpunitDir = `${target.containerDir}/vendor/wp-phpunit/wp-phpunit`

	// -e exports the wp-phpunit test-library path our bootstrap reads; -w sets the cwd
	// so phpunit finds the plugin's phpunit.xml(.dist). `php vendor/bin/phpunit` avoids
	// relying on the bind-mounted binary's executable bit.
	const res = await compose([
		"exec",
		"-T",
		"-w",
		target.containerDir,
		"-e",
		`WP_PHPUNIT__DIR=${wpPhpunitDir}`,
		"wordpress",
		"php",
		"vendor/bin/phpunit",
		"--colors=always",
	])
	process.stdout.write(res.stdout)
	if (res.stderr) process.stderr.write(res.stderr)
	return res.code
}

/**
 * Provision the test DB, then run phpunit for every bind-mounted local plugin that
 * ships a phpunit config. Returns the worst exit code (0 when nothing to run), so the
 * caller can fold PHP results into the overall `kizlo test` outcome. Plugin-agnostic:
 * it never hardcodes `plugins/kizlo`.
 */
export async function runPluginPhpunit(cfg: ResolvedTestConfig): Promise<number> {
	const targets = phpunitTargets(cfg)
	if (targets.length === 0) return 0

	await provisionTestDb()

	let worst = 0
	for (const target of targets) {
		log.info(`Running PHP tests for ${target.slug}…`)
		const code = await runTarget(target)
		if (code !== 0) worst = code
	}
	return worst
}
