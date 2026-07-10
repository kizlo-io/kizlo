import type { S2SClient } from "../../kizlo"
import { renderRobotsBody } from "../../seo/robots"
import { textResponse } from "../../seo/utils"

// Next wrapper around the framework-agnostic robots route. It caches the rendered body under
// the `"robots"` tag so the revalidation extension's `revalidateTag("robots")` refreshes it on
// content and settings changes. The wrapped function returns a string (not a `Response`), since
// `unstable_cache` round-trips its result and a `Response` would not survive that.
//
// The response deliberately omits `s-maxage`: the `unstable_cache` tag is the invalidation
// mechanism, and `revalidateTag("robots")` cannot purge a CDN edge entry created by `s-maxage`
// (Vercel consumes that directive for its own TTL, so the stale copy would keep serving for up
// to an hour and only `public, max-age=0` reaches the client). `must-revalidate` keeps the CDN
// from holding it, so every request re-runs this handler and reads the tag-backed data cache.
const ROBOTS_CACHE_CONTROL = "public, max-age=0, must-revalidate"

export function createRobotsRoute(client: S2SClient<[]>) {
	return async function GET(_request: Request): Promise<Response> {
		const { unstable_cache } = await import("next/cache")

		const body = await unstable_cache(() => renderRobotsBody(client), ["robots"], { tags: ["robots"] })()

		return textResponse(body, ROBOTS_CACHE_CONTROL)
	}
}
