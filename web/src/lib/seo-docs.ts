import type { SitemapIndexEntry, SitemapUrl } from "kizlo"
import docsSitemap from "./docs-sitemap.generated.json"

export const DOCS_SITEMAP_KEY = "docs"

const lastmod = new Date().toISOString()

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
