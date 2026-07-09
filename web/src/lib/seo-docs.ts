import type { SitemapIndexEntry, SitemapUrl } from "kizlo"
import { source } from "@/lib/source"

export const DOCS_SITEMAP_KEY = "docs"

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
