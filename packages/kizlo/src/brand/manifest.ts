import type { S2SClient } from "../kizlo"
import type { Settings } from "../settings/service.interface"
import { type ManifestIcon, resolveIcons } from "./icons"

// ====================================================
// WEB APP MANIFEST
//
// Builds the `site.webmanifest` object from settings. The icon set reuses the
// brand resolver so manifest icons follow the same raster-guarded fallback as
// every other surface. Name fields fall back across site → organization so a
// blank site name still yields a usable manifest.
//
// `createManifestRoute` is the framework-neutral route handler; integrations
// (e.g. Next.js) wrap it to add their own caching, mirroring `createRobotsRoute`.
// ====================================================

export const WEB_MANIFEST_ROUTE = "/site.webmanifest" as const

export interface WebManifest {
	id: string
	name: string
	short_name: string
	start_url: string
	scope: string
	display: "standalone" | "fullscreen" | "minimal-ui" | "browser"
	background_color?: string
	theme_color?: string
	icons: ManifestIcon[]
}

export function buildWebManifest(settings: Settings): WebManifest {
	const org = settings.identity.type === "organization" ? settings.identity.organization : null

	const manifest: WebManifest = {
		// `id`, `start_url`, and a non-`browser` `display` are what let Chrome treat
		// the site as installable (offer the install button); without them it reads
		// as an ordinary page. `scope` bounds which URLs open inside the app.
		id: "/",
		name: settings.site.name ?? org?.name ?? "",
		short_name: settings.site.alternate_name ?? org?.name ?? settings.site.name ?? "",
		start_url: "/",
		scope: "/",
		display: "standalone",
		icons: resolveIcons(settings.brand).manifestIcons,
	}

	// The manifest carries only the light colors; it has no dark-scheme variant.
	// Omit each when unset rather than forcing a default the brand never chose.
	if (settings.brand.theme_color) manifest.theme_color = settings.brand.theme_color
	if (settings.brand.background_color) manifest.background_color = settings.brand.background_color

	return manifest
}

export function createManifestRoute(client: S2SClient<[]>) {
	return async function GET(_request: Request): Promise<Response> {
		const settings = await client.settings.get.call()

		return new Response(JSON.stringify(buildWebManifest(settings)), {
			headers: {
				"Content-Type": "application/manifest+json",
			},
		})
	}
}
