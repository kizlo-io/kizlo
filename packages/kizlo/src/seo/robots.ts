import type { S2SClient } from "../kizlo"
import { renderRobots, textResponse } from "./utils"

/**
 * The spec fixes robots.txt at `/robots.txt`, so the route is not configurable. Serving it
 * from a route handler (rather than Next's `robots.ts` metadata convention) is deliberate:
 * `revalidatePath("/robots.txt")` only reaches a real route file, so this is what lets the
 * revalidation extension refresh robots.txt on content and settings changes.
 */
export const ROBOTS_ROUTE = "/robots.txt" as const

/**
 * Builds a Web `Request` -> `Response` handler that serves `robots.txt` as `text/plain`,
 * rendering the rules and sitemap links from the WordPress plugin's `/seo/robots` endpoint.
 * Framework-agnostic: it ignores the request and runs as-is on any web-standard server.
 */
export function createRobotsRoute(client: S2SClient<[]>) {
	return async function GET(_request: Request): Promise<Response> {
		const { data } = await client.seo.robots()
		if (!data) return textResponse("")

		return textResponse(renderRobots(data))
	}
}
