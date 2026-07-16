import { createManifestRoute as createCoreManifestRoute, WEB_MANIFEST_ROUTE } from "../../brand/manifest"
import type { S2SClient } from "../../kizlo"
import { createCachedTextRoute } from "./utils"

export { WEB_MANIFEST_ROUTE }

export const MANIFEST_CACHE_TAG = "kizlo:manifest"

export function createManifestRoute(client: S2SClient<[]>) {
	return createCachedTextRoute(createCoreManifestRoute(client), MANIFEST_CACHE_TAG, "application/manifest+json")
}
