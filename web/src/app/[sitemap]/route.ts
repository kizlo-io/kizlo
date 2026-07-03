import { notFound } from "next/navigation"
import { client } from "@/lib/kizlo/server"
import { parseSitemapSlug, renderUrlSet, xmlResponse } from "@/lib/seo"
import { DOCS_SITEMAP_KEY, docsSitemapUrls } from "@/lib/seo-docs"

export const revalidate = 3600

export async function GET(request: Request, { params }: { params: Promise<{ sitemap: string }> }) {
	const { sitemap } = await params

	const parsed = parseSitemapSlug(sitemap)
	if (!parsed) notFound()

	if (parsed.key === DOCS_SITEMAP_KEY) {
		if (parsed.page !== 1) notFound()

		const { origin } = new URL(request.url)

		return xmlResponse(renderUrlSet(docsSitemapUrls(origin)))
	}

	const { data: sitemaps, error: indexError } = await client.seo.sitemaps()
	if (indexError) notFound()

	const entry = sitemaps.find((item) => item.key === parsed.key)
	if (!entry || parsed.page > entry.pages) notFound()

	const { data, error } = await client.seo.urls(
		entry.type === "author" ? { type: "author", page: parsed.page } : { type: entry.type, key: entry.key, page: parsed.page },
	)
	if (error) notFound()

	return xmlResponse(renderUrlSet(data))
}
