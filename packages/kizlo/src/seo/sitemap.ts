import type { S2SClient } from "../kizlo"
import type { SitemapUrl } from "./schema"
import { parseSitemapSlug, renderSitemapIndex, renderUrlSet, type SitemapIndexEntry, xmlResponse } from "./utils"

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
export function createSitemapRoute(client: S2SClient<[]>, options?: CreateSitemapRouteOptions) {
	const extra = options?.extra ?? []

	return async function GET(request: Request): Promise<Response> {
		const url = new URL(request.url)
		const slug = lastPathSegment(url)
		if (!slug) return notFound()

		const { origin } = url

		if (slug === SITEMAP_INDEX_SLUG) {
			const { data } = await client.seo.sitemaps()
			const entries = [...(data ?? []), ...extra.map((item) => item.entry)]
			return xmlResponse(renderSitemapIndex(entries, origin))
		}

		const parsed = parseSitemapSlug(slug)
		if (!parsed) return notFound()

		const custom = extra.find((item) => item.entry.key === parsed.key)
		if (custom) {
			if (parsed.page > custom.entry.pages) return notFound()
			return xmlResponse(renderUrlSet(await custom.urls(origin, parsed.page)))
		}

		const { data: sitemaps } = await client.seo.sitemaps()
		if (!sitemaps) return notFound()

		const entry = sitemaps.find((item) => item.key === parsed.key)
		if (!entry || parsed.page > entry.pages) return notFound()

		const { data } = await client.seo.urls(
			entry.type === "author" ? { type: "author", page: parsed.page } : { type: entry.type, key: entry.key, page: parsed.page },
		)
		if (!data) return notFound()

		return xmlResponse(renderUrlSet(data))
	}
}

function lastPathSegment(url: URL): string {
	return decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "")
}

function notFound(): Response {
	return new Response("Not Found", { status: 404 })
}
