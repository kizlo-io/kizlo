import type { S2SClient } from "../../kizlo"
import { createRobotsRoute as createCoreRobotsRoute } from "../../seo/robots"

/**
 * Cache tag for the cached robots.txt body. The Next revalidation extension calls
 * `revalidateTag(ROBOTS_CACHE_TAG)` on every webhook event so the route refreshes
 * on-demand instead of on every request.
 */
export const ROBOTS_CACHE_TAG = "kizlo:robots"

export function createRobotsRoute(client: S2SClient<[]>) {
	const handler = createCoreRobotsRoute(client)

	let getBody: (() => Promise<string>) | undefined

	return async function GET(request: Request): Promise<Response> {
		if (!getBody) {
			const { unstable_cache } = await import("next/cache")
			getBody = unstable_cache(async () => (await handler(request)).text(), [ROBOTS_CACHE_TAG], { tags: [ROBOTS_CACHE_TAG] })
		}

		return new Response(await getBody(), {
			headers: {
				"Content-Type": "text/plain; charset=utf-8",
			},
		})
	}
}
