import type { PublicApiClient } from "../public-api"
import { requireData } from "../wordpress/utils"
import type { SitemapUrl } from "./schema"
import {
	deserializeSitemaps,
	deserializeSitemapUrls,
	parseSitemapSlug,
	renderSitemapIndex,
	renderUrlSet,
	type SitemapIndexEntry,
	xmlResponse,
} from "./utils"

/**
 * Every generated sitemap is served from `/sitemaps`: the index at `/sitemaps/index.xml`
 * and each collection page at `/sitemaps/{key}.xml` (later pages `-{n}`). The base is fixed
 * because the index `<loc>` entries (built by `sitemapEntryPath`) point at it, so the route
 * must be mounted there for the links to resolve. How the route is mounted is a
 * framework concern; this handler only cares about the trailing slug.
 */
export const SITEMAP_BASE = "/sitemaps"

/** Slug that serves the sitemap index (`/sitemaps/index.xml`) rather than a collection. */
export const SITEMAP_INDEX_SLUG = "index.xml"

/**
 * A sitemap not backed by WordPress (e.g. docs pages living in the app). It joins the
 * same index/urlset pipeline: `entry` adds it to the index, `urls` serves its pages.
 */
export interface SitemapRouteExtra {
	entry: SitemapIndexEntry
	urls: (origin: string, page: number) => SitemapUrl[] | Promise<SitemapUrl[]>
}

export interface CreateSitemapRouteOptions {
	/** Extra, non-WordPress sitemaps to fold into the index and serve. */
	extra?: SitemapRouteExtra[]
}

/**
 * Builds a Web `Request` -> `Response` handler that serves the sitemap index
 * (`/sitemaps/index.xml`) and every collection page, merging any `extra` sitemaps in.
 * Framework-agnostic: the slug is the last path segment of the request URL, so this runs
 * as-is on any web-standard server (Hono, a plain fetch handler, a Next route handler).
 * Mounting it at the right path is the caller's job; framework wrappers (e.g. the Next
 * integration) add mount assertions on top.
 */
export function createSitemapRoute(client: PublicApiClient, options?: CreateSitemapRouteOptions) {
	const extra = options?.extra ?? []

	return async function GET(request: Request): Promise<Response> {
		const url = new URL(request.url)
		const slug = lastPathSegment(url)
		if (!slug) return notFound()

		if (slug === SITEMAP_INDEX_SLUG) {
			const data = requireData(await client.kizlo.seo.sitemaps.retrieve({ params: { type: "index" } }))
			if (Array.isArray(data)) return notFound()
			const entries = [...deserializeSitemaps(data.sitemaps), ...extra.map((item) => item.entry)]
			return xmlResponse(renderSitemapIndex(entries, data.origin))
		}

		const parsed = parseSitemapSlug(slug)
		if (!parsed) return notFound()

		const custom = extra.find((item) => item.entry.key === parsed.key)
		if (custom) {
			if (parsed.page > custom.entry.pages) return notFound()
			const data = requireData(await client.kizlo.seo.sitemaps.retrieve({ params: { type: "index" } }))
			if (Array.isArray(data)) return notFound()
			return xmlResponse(renderUrlSet(await custom.urls(data.origin, parsed.page)))
		}

		const sitemaps = requireData(await client.kizlo.seo.sitemaps.list())

		const entry = sitemaps.find((item) => item.key === parsed.key)
		if (!entry || parsed.page > entry.pages) return notFound()

		const data =
			entry.type === "author"
				? requireData(await client.kizlo.seo.sitemaps.retrieve({ params: { type: "author" }, query: { page: parsed.page } }))
				: requireData(
						await client.kizlo.seo.sitemaps.listUrls({ params: { type: entry.type, key: entry.key }, query: { page: parsed.page } }),
					)
		if (!Array.isArray(data)) return notFound()

		return xmlResponse(renderUrlSet(deserializeSitemapUrls(data)))
	}
}

/**
 * Builds a handler that permanently redirects the well-known `/sitemap.xml` to the generated
 * sitemap index at `/sitemaps/index.xml`. Crawlers probe the standard path regardless of what
 * robots.txt advertises, so this points them at the real index. The target is derived from the
 * same `SITEMAP_BASE`/`SITEMAP_INDEX_SLUG` constants the sitemap route is mounted on, so there is
 * a single source of truth for where the index lives. Framework-agnostic like `createSitemapRoute`.
 */
export function createSitemapRedirectRoute() {
	const location = `${SITEMAP_BASE}/${SITEMAP_INDEX_SLUG}`

	return function GET(_request: Request): Response {
		return new Response(null, { status: 308, headers: { Location: location } })
	}
}

function lastPathSegment(url: URL): string {
	return decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "")
}

function notFound(): Response {
	return new Response("Not Found", { status: 404 })
}
