import { createManifestRoute as createCoreManifestRoute, WEB_MANIFEST_ROUTE } from "../../brand/manifest"
import type { PublicApiClient } from "../../public-api"
import { createCachedTextRoute } from "./utils"

export { WEB_MANIFEST_ROUTE }

export const MANIFEST_CACHE_TAG = "kizlo:manifest"

export function createManifestRoute(client: PublicApiClient) {
	return createCachedTextRoute(createCoreManifestRoute(client), MANIFEST_CACHE_TAG, "application/manifest+json")
}
