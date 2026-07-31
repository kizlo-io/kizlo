import type { S2SClient } from "../../kizlo"
import {
	type CreateSitemapRouteOptions,
	createSitemapRedirectRoute as createCoreSitemapRedirectRoute,
	createSitemapRoute as createCoreSitemapRoute,
} from "../../seo/sitemap"
import type { ServerRoute } from "./utils"

/**
 * TanStack Start `GET` handler for `src/routes/sitemaps/$sitemap[.]xml.ts`. The core handler reads the
 * slug from the request URL's last segment (`/sitemaps/posts.xml` → `posts.xml`), so forwarding the raw
 * request needs no `params` plumbing.
 */
export function createSitemapRoute(client: S2SClient<[]>, options?: CreateSitemapRouteOptions): ServerRoute {
	const handler = createCoreSitemapRoute(client, options)
	return (context) => handler(context.request)
}

/** TanStack Start `GET` handler for `src/routes/sitemap[.]xml.ts`: 308-redirects the well-known path to the index. */
export function createSitemapRedirectRoute(): ServerRoute {
	const handler = createCoreSitemapRedirectRoute()
	return (context) => handler(context.request)
}
