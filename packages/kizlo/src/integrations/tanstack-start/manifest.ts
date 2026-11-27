import { createManifestRoute as createCoreManifestRoute, WEB_MANIFEST_ROUTE } from "../../brand/manifest"
import type { PublicApiClient } from "../../public-api"
import type { ServerRoute } from "./utils"

export { WEB_MANIFEST_ROUTE }

/** TanStack Start `GET` handler for `src/routes/site[.]webmanifest.ts`. SSR refetches live on each request. */
export function createManifestRoute(client: PublicApiClient): ServerRoute {
	const handler = createCoreManifestRoute(client)
	return (context) => handler(context.request)
}
