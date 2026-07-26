// ====================================================
// PLUGIN VERSION COMPATIBILITY
// ====================================================

/**
 * The lowest WordPress plugin version the client is compatible with. Bump this whenever the client
 * starts to depend on a plugin change (a new endpoint, a changed response shape) that older plugins
 * don't have. One-directional: the client only asserts a minimum, never a range.
 */
export const MIN_PLUGIN_VERSION = "0.8.1"

/**
 * Response header the plugin stamps its version on (lowercase — `Headers.get` is case-insensitive, and
 * this is compared against `Headers.get` output). The client reads it off responses it already makes,
 * so no extra request is needed to learn the installed version.
 */
export const PLUGIN_VERSION_HEADER = "x-kizlo-version"

/** Parse a `major.minor.patch` string into a numeric tuple, dropping any `-prerelease`/`+build` suffix. */
function parseVersion(version: string): [number, number, number] | null {
	const [core = ""] = version.trim().split(/[-+]/, 1)
	const parts = core.split(".")
	if (parts.length !== 3) return null
	const [major, minor, patch] = parts.map((part) => Number(part))
	if ([major, minor, patch].some((num) => num === undefined || !Number.isInteger(num) || num < 0)) return null
	return [major as number, minor as number, patch as number]
}

/** Compare two version tuples: negative when `a < b`, positive when `a > b`, zero when equal. */
function compare(a: [number, number, number], b: [number, number, number]): number {
	return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

/**
 * Whether an installed plugin version satisfies {@link MIN_PLUGIN_VERSION}. A missing (null/undefined) or
 * malformed version counts as unsupported — a plugin predating the version header sends none, which is
 * exactly the outdated case we want to flag.
 */
export function isPluginVersionSupported(installed: string | null | undefined): boolean {
	if (!installed) return false
	const parsed = parseVersion(installed)
	if (!parsed) return false
	return compare(parsed, parseVersion(MIN_PLUGIN_VERSION) as [number, number, number]) >= 0
}

/** The user-facing "update the plugin" guidance, single-sourced for the CLI and the runtime warning. */
export function pluginUpdateMessage(installed?: string | null): string {
	const found = installed ?? "not detected"
	return `Kizlo plugin outdated (${found}). Update to ${MIN_PLUGIN_VERSION}+.`
}
