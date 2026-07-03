import type { SitemapUrl } from "kizlo"
import type { SitemapIndexEntry } from "@/lib/seo"
import { source } from "@/lib/source"

// The docs live in this Next app (fumadocs), not WordPress, so they never show
// up in `client.seo.sitemaps()`. We surface them under a local `docs` key that
// slots into the same index/urlset pipeline as the WordPress-backed sitemaps.
export const DOCS_SITEMAP_KEY = "docs"

// Docs are static content built from MDX with no per-page modified date, so we
// stamp the whole set with the process start time. It refreshes on each deploy.
const lastmod = new Date().toISOString()

export function docsSitemapEntry(): SitemapIndexEntry {
	return { key: DOCS_SITEMAP_KEY, pages: 1, lastmod }
}

export function docsSitemapUrls(origin: string): SitemapUrl[] {
	return source.getPages().map((page) => ({
		loc: `${origin}${page.url}`,
		lastmod,
		images: [],
	}))
}
