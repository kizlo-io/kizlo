import type { PublicApiClient } from "../public-api"
import type { Settings } from "../settings/service.interface"
import type { WP_EndpointData } from "../wordpress/types"
import { requireData } from "../wordpress/utils"
import { type ManifestIcon, resolveIcons } from "./icons"

// ====================================================
// WEB APP MANIFEST
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

export function buildWebManifest(settings: WP_EndpointData<"kizlo.site.retrieve"> & { identity?: Settings["identity"] }): WebManifest {
	const org = settings.identity?.type === "organization" ? settings.identity.organization : null

	const manifest: WebManifest = {
		id: "/",
		name: settings.site.name ?? org?.name ?? "",
		short_name: settings.site.alternate_name ?? org?.name ?? settings.site.name ?? "",
		start_url: "/",
		scope: "/",
		display: "standalone",
		icons: resolveIcons(settings.brand).manifestIcons,
	}

	if (settings.brand.theme_color) manifest.theme_color = settings.brand.theme_color
	if (settings.brand.background_color) manifest.background_color = settings.brand.background_color

	return manifest
}

export function createManifestRoute(client: PublicApiClient) {
	return async function GET(_request: Request): Promise<Response> {
		const settings = requireData(await client.kizlo.site.retrieve())

		return new Response(JSON.stringify(buildWebManifest(settings)), {
			headers: {
				"Content-Type": "application/manifest+json",
			},
		})
	}
}
