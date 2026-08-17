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
 * Whether an installed version is at least `minimum`. A missing (null/undefined) or malformed version
 * counts as unsupported — something predating the version header sends none, which is exactly the
 * outdated case we want to flag.
 */
export function satisfiesVersion(installed: string | null | undefined, minimum: string): boolean {
	if (!installed) return false
	const parsed = parseVersion(installed)
	const floor = parseVersion(minimum)
	if (!parsed || !floor) return false
	return compare(parsed, floor) >= 0
}

/** Whether an installed plugin version satisfies {@link MIN_PLUGIN_VERSION}. */
export function isPluginVersionSupported(installed: string | null | undefined): boolean {
	return satisfiesVersion(installed, MIN_PLUGIN_VERSION)
}

/** The user-facing "update the plugin" guidance, single-sourced for the CLI and the runtime warning. */
export function pluginUpdateMessage(installed?: string | null): string {
	const found = installed ?? "not detected"
	return `Kizlo plugin outdated (${found}). Update to ${MIN_PLUGIN_VERSION}+.`
}

// ====================================================
// EXTENSION PLUGIN COMPATIBILITY
// ====================================================

/**
 * Response header the plugin stamps the extension plugins that started on, as `slug=version` pairs:
 * `kizlo-woocommerce=0.2.0,kizlo-cf7=0.1.0`. An extension whose own requirements failed did not start
 * and is absent, so presence here means the contract behind it is registered, not merely installed.
 */
export const EXTENSION_VERSIONS_HEADER = "x-kizlo-extensions"

/** The WordPress plugin a client-side extension needs, and the oldest version of it that carries its contract. */
export interface ExtensionPluginRequirement {
	/** Plugin slug, as the plugin's own directory names it. */
	slug: string
	/** Display name, for the warning text. */
	name: string
	/** Oldest version that registers the endpoints this extension calls. */
	version: string
}

/** Parse {@link EXTENSION_VERSIONS_HEADER} into slug/version pairs. Malformed pairs are dropped. */
export function parseExtensionVersions(header: string | null | undefined): Record<string, string> {
	if (!header) return {}
	const versions: Record<string, string> = {}
	for (const pair of header.split(",")) {
		const [slug, version] = pair.split("=")
		if (slug?.trim() && version?.trim()) versions[slug.trim()] = version.trim()
	}
	return versions
}

/** The user-facing "update the extension plugin" guidance, mirroring {@link pluginUpdateMessage}. */
export function extensionUpdateMessage(requirement: ExtensionPluginRequirement, installed?: string | null): string {
	const found = installed ?? "not active"
	return `${requirement.name} plugin outdated (${found}). Update to ${requirement.version}+.`
}
