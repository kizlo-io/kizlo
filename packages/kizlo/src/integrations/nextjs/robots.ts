import type { S2SClient } from "../../kizlo"
import { renderRobotsBody } from "../../seo/robots"
import { textResponse } from "../../seo/utils"

// Next wrapper around the framework-agnostic robots route. It caches the rendered body under
// the `"robots"` tag so the revalidation extension's `revalidateTag("robots")` refreshes it on
// content and settings changes. The wrapped function returns a string (not a `Response`), since
// `unstable_cache` round-trips its result and a `Response` would not survive that.
export function createRobotsRoute(client: S2SClient<[]>) {
	return async function GET(_request: Request): Promise<Response> {
		const { unstable_cache } = await import("next/cache")

		const body = await unstable_cache(() => renderRobotsBody(client), ["robots"], { tags: ["robots"] })()

		return textResponse(body)
	}
}
