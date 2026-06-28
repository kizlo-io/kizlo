import { gitConfig, siteUrl } from "./shared"

// Plugins distributed as GitHub Release zips (tags `<slug>-v<version>`). The
// descriptive + WP-compat fields live here because the web app can't read the
// `plugins/*/readme.txt` headers at runtime; they change rarely. Versions,
// download URLs and changelogs are pulled live from GitHub Releases.
export const PLUGINS = {
	kizlo: {
		name: "Kizlo",
		description: "A plugin that connects your WordPress with Kizlo toolkit, headlessly.",
		requires: "5.0",
		tested: "6.7",
		requires_php: "8.2",
	},
	"kizlo-cf7": {
		name: "Kizlo Contact Form 7",
		description: "Connects contact form 7 plugin with @kizlo/cf7 extension.",
		requires: "6.5",
		tested: "6.7",
		requires_php: "8.2",
	},
	"kizlo-woocommerce": {
		name: "Kizlo WooCommerce",
		description: "Connects woocommerce plugin with @kizlo/woocommerce extension.",
		requires: "6.5",
		tested: "6.7",
		requires_php: "8.2",
	},
} as const

export type PluginSlug = keyof typeof PLUGINS

export function isPluginSlug(slug: string): slug is PluginSlug {
	return slug in PLUGINS
}

export type PluginRelease = {
	version: string
	tag: string
	zipUrl: string
	publishedAt: string
	body: string
}

type GitHubRelease = {
	tag_name: string
	published_at: string
	body: string | null
	draft: boolean
	assets: { name: string; browser_download_url: string }[]
}

const releasesUrl = `https://api.github.com/repos/${gitConfig.user}/${gitConfig.repo}/releases?per_page=100`

// Cache tag for the shared GitHub releases list. The release workflow POSTs to
// `/api/revalidate?tag=plugin-releases` after publishing a release so a newly-
// tagged plugin shows up immediately instead of waiting out `revalidate`.
export const PLUGIN_RELEASES_TAG = "plugin-releases"

// Compares two semvers (a > b → 1). A prerelease sorts below the release of the
// same x.y.z (1.0.0-beta < 1.0.0), matching semver precedence.
function compareSemver(a: string, b: string): number {
	const [acore, apre] = a.split("-")
	const [bcore, bpre] = b.split("-")
	const an = acore.split(".").map(Number)
	const bn = bcore.split(".").map(Number)
	for (let i = 0; i < 3; i++) {
		if (an[i] !== bn[i]) return an[i] > bn[i] ? 1 : -1
	}
	if (apre === bpre) return 0
	if (!apre) return 1
	if (!bpre) return -1
	return apre > bpre ? 1 : apre < bpre ? -1 : 0
}

async function fetchReleases(): Promise<GitHubRelease[]> {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
	}
	// Optional — the repo is public so this works unauthenticated (60 req/hr),
	// but a token raises the limit to 5000/hr on shared serverless IPs.
	if (process.env.GITHUB_TOKEN) {
		headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
	}

	const res = await fetch(releasesUrl, { headers, next: { revalidate: 600, tags: [PLUGIN_RELEASES_TAG] } })
	if (!res.ok) {
		throw new Error(`GitHub releases request failed: ${res.status} ${res.statusText}`)
	}
	return res.json()
}

// The GitHub "Latest" flag is unusable here because changeset npm-package
// releases (`kizlo@0.1.0`, `@kizlo/woocommerce@0.1.0`, …) share the same list,
// so we filter by the `<slug>-v` tag prefix and compute the max version ourselves.
export async function getPluginReleases(slug: PluginSlug): Promise<PluginRelease[]> {
	const prefix = `${slug}-v`
	const releases = await fetchReleases()

	const matched: PluginRelease[] = []
	for (const release of releases) {
		if (release.draft) continue
		if (!release.tag_name.startsWith(prefix)) continue
		const version = release.tag_name.slice(prefix.length)
		if (!/^\d+\.\d+\.\d+(-[\w.-]+)?$/.test(version)) continue
		const zip = release.assets.find((a) => a.name.endsWith(".zip"))
		if (!zip) continue
		matched.push({
			version,
			tag: release.tag_name,
			zipUrl: zip.browser_download_url,
			publishedAt: release.published_at,
			body: release.body ?? "",
		})
	}

	return matched.sort((a, b) => compareSemver(b.version, a.version))
}

export async function getLatestRelease(slug: PluginSlug): Promise<PluginRelease | null> {
	const releases = await getPluginReleases(slug)
	return releases[0] ?? null
}

// PUC (Yahnis-Elsts Plugin Update Checker) self-hosted metadata format. Only
// `version` + `download_url` are strictly required; the rest enrich the WP
// update UI. `download_url` uses the clean kizlo.io redirect (version-pinned);
// WP's upgrader follows the 302 to the GitHub `.zip`.
export function buildPucMetadata(slug: PluginSlug, release: PluginRelease) {
	const meta = PLUGINS[slug]
	return {
		name: meta.name,
		slug,
		version: release.version,
		download_url: `${siteUrl}/plugins/${slug}/download?version=${release.version}`,
		homepage: `${siteUrl}/plugins/${slug}`,
		requires: meta.requires,
		tested: meta.tested,
		requires_php: meta.requires_php,
		last_updated: release.publishedAt
			.replace("T", " ")
			.replace(/\.\d+Z$/, "")
			.replace("Z", ""),
		sections: {
			description: meta.description,
			changelog: release.body,
		},
	}
}
