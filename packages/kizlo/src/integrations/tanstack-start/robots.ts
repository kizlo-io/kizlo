import type { PublicApiClient } from "../../public-api"
import { createRobotsRoute as createCoreRobotsRoute } from "../../seo/robots"
import type { ServerRoute } from "./utils"

/** TanStack Start `GET` handler for `src/routes/robots[.]txt.ts`. SSR refetches live on each request. */
export function createRobotsRoute(client: PublicApiClient): ServerRoute {
	const handler = createCoreRobotsRoute(client)
	return (context) => handler(context.request)
}
