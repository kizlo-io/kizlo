import type { PublicApiClient } from "../../public-api"
import { createRobotsRoute as createCoreRobotsRoute } from "../../seo/robots"
import { createCachedTextRoute } from "./utils"

export const ROBOTS_CACHE_TAG = "kizlo:robots"

export function createRobotsRoute(client: PublicApiClient) {
	return createCachedTextRoute(createCoreRobotsRoute(client), ROBOTS_CACHE_TAG, "text/plain; charset=utf-8")
}
