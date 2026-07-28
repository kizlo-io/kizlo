import type { S2SClient } from "../../kizlo"
import { createRobotsRoute as createCoreRobotsRoute } from "../../seo/robots"
import type { AstroRoute } from "./utils"

/** Astro endpoint for `src/pages/robots.txt.ts`. SSR refetches live on each request. */
export function createRobotsRoute(client: S2SClient<[]>): AstroRoute {
	const handler = createCoreRobotsRoute(client)
	return (context) => handler(context.request)
}
