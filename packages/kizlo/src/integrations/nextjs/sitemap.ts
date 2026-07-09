import type { S2SClient } from "../../kizlo"
import { type CreateSitemapRouteOptions, createSitemapRoute as createCoreSitemapRoute, SITEMAP_BASE } from "../../seo/sitemap"

/**
 * The Next route the sitemap handler is mounted at: a single dynamic segment named
 * `[sitemap]`. It is fixed (not configurable) so that one `revalidatePath(SITEMAP_ROUTE,
 * "page")` refreshes the index and every generated sitemap at once. `[sitemap]` is Next's
 * file-routing convention, which is why it lives in this integration and not in core.
 */
export const SITEMAP_ROUTE = `${SITEMAP_BASE}/[sitemap]` as const

/** Next's dynamic-route context. `params` is a promise in the App Router. */
interface NextRouteContext {
	params?: { sitemap?: string } | Promise<{ sitemap?: string }>
}

/**
 * Next wrapper around the framework-agnostic {@link createCoreSitemapRoute}. It serves the
 * same sitemap index and collection pages, and additionally asserts the route is mounted at
 * {@link SITEMAP_ROUTE}: if the dynamic segment is not named `[sitemap]`, `params.sitemap`
 * is missing and a wrong mount would silently break `revalidatePath(SITEMAP_ROUTE, "page")`,
 * so it throws loudly on the first request instead.
 */
export function createSitemapRoute(client: S2SClient<[]>, options?: CreateSitemapRouteOptions) {
	const handler = createCoreSitemapRoute(client, options)

	return async function GET(request: Request, ctx?: NextRouteContext): Promise<Response> {
		const params = ctx?.params ? await ctx.params : undefined
		if (params && params.sitemap === undefined) {
			throw new Error(`createSitemapRoute must be mounted at "${SITEMAP_ROUTE}". The dynamic segment must be named [sitemap].`)
		}

		return handler(request)
	}
}
