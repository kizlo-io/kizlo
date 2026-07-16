import type { S2SClient } from "../../kizlo"
import { createRobotsRoute as createCoreRobotsRoute } from "../../seo/robots"
import { createCachedTextRoute } from "./utils"

export const ROBOTS_CACHE_TAG = "kizlo:robots"

export function createRobotsRoute(client: S2SClient<[]>) {
	return createCachedTextRoute(createCoreRobotsRoute(client), ROBOTS_CACHE_TAG, "text/plain; charset=utf-8")
}
