import type { PublicApiClient } from "../../public-api"
import { createRobotsRoute as createCoreRobotsRoute } from "../../seo/robots"
import type { AstroRoute } from "./utils"

/** Astro endpoint for `src/pages/robots.txt.ts`. SSR refetches live on each request. */
export function createRobotsRoute(client: PublicApiClient): AstroRoute {
	const handler = createCoreRobotsRoute(client)
	return (context) => handler(context.request)
}
