import type { S2SClient } from "../kizlo"
import { renderRobots, textResponse } from "./utils"

/**
 * The spec fixes robots.txt at `/robots.txt`, so the route is not configurable. Serving it
 * from a route handler (rather than Next's `robots.ts` metadata convention) is deliberate:
 * `revalidatePath("/robots.txt")` only reaches a real route file, so this is what lets the
 * revalidation extension refresh robots.txt on content and settings changes.
 *
 * One caveat when mounting this route: give it a numeric `revalidate` (ISR) rather than
 * leaving it fully static. A literal path prerenders at build into an immutable
 * `revalidate: false` asset with no regeneration function, so on Vercel the revalidation
 * purges the edge cache but has nothing to regenerate against and the stale copy keeps
 * serving until a redeploy. See vercel/next.js#60641.
 */
export const ROBOTS_ROUTE = "/robots.txt" as const

/**
 * Fetches and renders the `robots.txt` body from the WordPress plugin's `/seo/robots`
 * endpoint, returning it as a plain string (empty when the endpoint has no data). Exposed
 * so framework integrations can wrap the render in their own caching before it becomes a
 * `Response` (e.g. Next's `unstable_cache`), rather than caching an opaque `Response`.
 */
export async function renderRobotsBody(client: S2SClient<[]>): Promise<string> {
	const { data } = await client.seo.robots()
	return data ? renderRobots(data) : ""
}

/**
 * Builds a Web `Request` -> `Response` handler that serves `robots.txt` as `text/plain`,
 * rendering the rules and sitemap links from the WordPress plugin's `/seo/robots` endpoint.
 * Framework-agnostic: it ignores the request and runs as-is on any web-standard server.
 */
export function createRobotsRoute(client: S2SClient<[]>) {
	return async function GET(_request: Request): Promise<Response> {
		return textResponse(await renderRobotsBody(client))
	}
}
