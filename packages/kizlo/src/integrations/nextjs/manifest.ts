import { createManifestRoute as createCoreManifestRoute, WEB_MANIFEST_ROUTE } from "../../brand/manifest"
import type { S2SClient } from "../../kizlo"

export { WEB_MANIFEST_ROUTE }

export const MANIFEST_CACHE_TAG = "kizlo:manifest"

export function createManifestRoute(client: S2SClient<[]>) {
	const handler = createCoreManifestRoute(client)

	let getBody: (() => Promise<string>) | undefined

	return async function GET(request: Request): Promise<Response> {
		if (!getBody) {
			const { unstable_cache } = await import("next/cache")
			getBody = unstable_cache(async () => (await handler(request)).text(), [MANIFEST_CACHE_TAG], { tags: [MANIFEST_CACHE_TAG] })
		}

		return new Response(await getBody(), {
			headers: {
				"Content-Type": "application/manifest+json",
			},
		})
	}
}
