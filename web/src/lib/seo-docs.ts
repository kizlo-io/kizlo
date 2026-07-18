import type { SitemapIndexEntry, SitemapUrl } from "kizlo"
import docsSitemap from "./docs-sitemap.generated.json"

export const DOCS_SITEMAP_KEY = "docs"

// Drop milliseconds so lastmod is clean W3C datetime, matching the WordPress-generated entries.
const lastmod = new Date().toISOString().replace(/\.\d{3}Z$/, "Z")

export function docsSitemapEntry(): SitemapIndexEntry {
	return { key: DOCS_SITEMAP_KEY, pages: 1, lastmod }
}

export function docsSitemapUrls(origin: string): SitemapUrl[] {
	return docsSitemap.paths.map((path) => ({
		loc: `${origin}${path}`,
		lastmod,
		images: [],
	}))
}
