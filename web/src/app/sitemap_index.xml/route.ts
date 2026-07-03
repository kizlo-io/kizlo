import { client } from "@/lib/kizlo/server"
import { renderSitemapIndex, xmlResponse } from "@/lib/seo"
import { docsSitemapEntry } from "@/lib/seo-docs"

export const revalidate = 3600

export async function GET(request: Request) {
	const { origin } = new URL(request.url)
	const { data, error } = await client.seo.sitemaps()

	const sitemaps = [...(error ? [] : data), docsSitemapEntry()]

	return xmlResponse(renderSitemapIndex(sitemaps, origin))
}
