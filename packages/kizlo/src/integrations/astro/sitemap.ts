import type { S2SClient } from "../../kizlo"
import {
	type CreateSitemapRouteOptions,
	createSitemapRedirectRoute as createCoreSitemapRedirectRoute,
	createSitemapRoute as createCoreSitemapRoute,
} from "../../seo/sitemap"
import type { AstroRoute } from "./utils"

/**
 * Astro endpoint for `src/pages/sitemaps/[sitemap].xml.ts`. The core handler reads the slug from the
 * request URL's last segment (`/sitemaps/posts.xml` → `posts.xml`), so forwarding `context.request`
 * needs no `params` plumbing.
 */
export function createSitemapRoute(client: S2SClient<[]>, options?: CreateSitemapRouteOptions): AstroRoute {
	const handler = createCoreSitemapRoute(client, options)
	return (context) => handler(context.request)
}

/** Astro endpoint for `src/pages/sitemap.xml.ts`: 308-redirects the well-known path to the index. */
export function createSitemapRedirectRoute(): AstroRoute {
	const handler = createCoreSitemapRedirectRoute()
	return (context) => handler(context.request)
}
