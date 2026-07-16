import { existsSync, readFileSync } from "node:fs"
import { basename, dirname, resolve } from "node:path"
import { CONFIG_FILES, CREDENTIALS_REL, SEED_MARKER_OPTION, SEED_VERSION } from "./constants"
import { compose, wpCli } from "./docker"
import { type DevPluginSource, isLocalPlugin, type PluginSource, type TestCredentials } from "./types"

/**
 * True only when the stack is already seeded: the credentials artifact exists on
 * the host and this database carries the current seed marker (an option written
 * as the final bootstrap step). The marker is independent of fixture content, so
 * it stays accurate no matter which fixtures a consumer mounts; `option get` also
 * fails when core isn't installed, so it doubles as the DB-initialized check.
 *
 * After `wp reset` the DB volume is gone so the marker is absent and `wp up`
 * reseeds; after `wp stop` the DB is intact so it passes and `wp up` just resumes.
 * Bumping `SEED_VERSION` invalidates older marks and forces a reseed.
 */
export async function isSeeded(): Promise<boolean> {
	if (!existsSync(credentialsPath())) return false

	const marker = await compose(["exec", "-T", "wp-cli", "wp", "option", "get", SEED_MARKER_OPTION])
	return marker.code === 0 && marker.stdout.trim() === SEED_VERSION
}

/** Resolve a `PluginSource` to the `(name, source)` pair `ensurePlugin` needs. */
export function resolvePluginSource(plugin: PluginSource): [name: string, source: string] {
	return typeof plugin === "string" ? [plugin, plugin] : [plugin.name, plugin.source]
}

/**
 * Ensure a plugin is active without ever re-downloading. Plugin files persist in
 * the `wp_data` volume, so an already-installed plugin is just activated; the
 * download (`source` = release zip URL or wp.org slug) happens only when the files
 * are absent (i.e. after `wp reset` wipes the volume).
 */
export async function ensurePlugin(name: string, source: string): Promise<void> {
	const active = await compose(["exec", "-T", "wp-cli", "wp", "plugin", "is-active", name])
	if (active.code === 0) return

	const installed = await compose(["exec", "-T", "wp-cli", "wp", "plugin", "is-installed", name])
	if (installed.code === 0) {
		await wpCli(["plugin", "activate", name])
		return
	}

	await wpCli(["plugin", "install", source, "--activate"])
}

/**
 * Activate a bind-mounted local plugin by its directory basename (the slug the
 * mount lands at under `wp-content/plugins`). Idempotent: the files arrive via the
 * compose bind, so there's nothing to install — just activate if it isn't already.
 */
export async function activateLocalPlugin(pluginPath: string): Promise<void> {
	const slug = basename(pluginPath)
	const active = await compose(["exec", "-T", "wp-cli", "wp", "plugin", "is-active", slug])
	if (active.code !== 0) await wpCli(["plugin", "activate", slug])
}

/**
 * Ensure every plugin is active. Installable sources go first so a bind-mounted
 * local plugin that depends on one (e.g. a WooCommerce extension) finds it already
 * present; then each {@link LocalPlugin} is activated by basename. A local plugin
 * whose slug matches an installable (e.g. mounting `kizlo` over the released
 * `kizlo`) is seen as already installed, so `ensurePlugin` activates the live
 * files instead of downloading over them.
 */
export async function ensurePlugins(plugins: DevPluginSource[]): Promise<void> {
	for (const plugin of plugins) {
		if (!isLocalPlugin(plugin)) await ensurePlugin(...resolvePluginSource(plugin))
	}
	for (const plugin of plugins) {
		if (isLocalPlugin(plugin)) await activateLocalPlugin(plugin.path)
	}
}

/**
 * The directory holding `kizlo.config.*`, found by walking up from `cwd` (falling
 * back to `cwd` when none is found). Anchoring the credentials artifact here —
 * rather than each process's cwd — is what lets the CLI writer and the test reader
 * agree even when tests run from a sub-directory of the config root.
 */
export function findConfigDir(cwd: string = process.cwd()): string {
	let dir = resolve(cwd)
	for (;;) {
		if (CONFIG_FILES.some((name) => existsSync(resolve(dir, name)))) return dir
		const parent = dirname(dir)
		if (parent === dir) return resolve(cwd)
		dir = parent
	}
}

/** Fixed credentials artifact path, anchored to the config root. */
export function credentialsPath(cwd?: string): string {
	return resolve(findConfigDir(cwd), CREDENTIALS_REL)
}

let cached: TestCredentials | null = null

export function getTestCredentials(): TestCredentials {
	if (cached) return cached
	cached = JSON.parse(readFileSync(credentialsPath(), "utf-8")) as TestCredentials
	return cached
}

/**
 * The host port the credentials artifact advertises, if it exists — the port a warm test
 * stack is pinned to. Tests connect via this URL, so a reused stack must come back up on
 * the same port; `undefined` means no stack has ever been seeded here (a cold boot).
 */
export function recordedPort(): number | undefined {
	const path = credentialsPath()
	if (!existsSync(path)) return undefined
	try {
		const { url } = JSON.parse(readFileSync(path, "utf-8")) as TestCredentials
		const port = new URL(url).port
		return port ? Number(port) : undefined
	} catch {
		return undefined
	}
}
