import { createManifestRoute as createCoreManifestRoute, WEB_MANIFEST_ROUTE } from "../../brand/manifest"
import type { PublicApiClient } from "../../public-api"
import type { AstroRoute } from "./utils"

export { WEB_MANIFEST_ROUTE }

/** Astro endpoint for `src/pages/site.webmanifest.ts`. SSR refetches live on each request. */
export function createManifestRoute(client: PublicApiClient): AstroRoute {
	const handler = createCoreManifestRoute(client)
	return (context) => handler(context.request)
}
