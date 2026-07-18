import type { S2SClient } from "../../kizlo"
import { type CreateSitemapRouteOptions, createSitemapRoute as createCoreSitemapRoute, SITEMAP_BASE } from "../../seo/sitemap"
import { xmlResponse } from "../../seo/utils"

export { createSitemapRedirectRoute } from "../../seo/sitemap"

export const SITEMAP_ROUTE = `${SITEMAP_BASE}/[sitemap]` as const

export const SITEMAP_CACHE_TAG = "kizlo:sitemap"

/**
 * Next's dynamic-route context for the `[sitemap]` segment. Typed to match the App Router's
 * `RouteContext` (required, `params` a promise) so `next typegen` accepts the exported handler.
 */
interface NextRouteContext {
	params: Promise<{ sitemap: string }>
}

export function createSitemapRoute(client: S2SClient<[]>, options?: CreateSitemapRouteOptions) {
	const handler = createCoreSitemapRoute(client, options)

	let getCached: ((url: string) => Promise<{ status: number; body: string }>) | undefined

	return async function GET(request: Request, ctx: NextRouteContext): Promise<Response> {
		const { sitemap } = (await ctx.params) as { sitemap?: string }
		if (sitemap === undefined) {
			throw new Error(`createSitemapRoute must be mounted at "${SITEMAP_ROUTE}". The dynamic segment must be named [sitemap].`)
		}

		if (!getCached) {
			const { unstable_cache } = await import("next/cache")
			getCached = unstable_cache(
				async (url: string) => {
					const response = await handler(new Request(url))
					return { status: response.status, body: await response.text() }
				},
				[SITEMAP_CACHE_TAG],
				{ tags: [SITEMAP_CACHE_TAG] },
			)
		}

		const { status, body } = await getCached(request.url)

		return status === 200 ? xmlResponse(body) : new Response(body, { status })
	}
}
