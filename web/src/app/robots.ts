import type { MetadataRoute } from "next"
import { client } from "@/lib/kizlo/server"
import { siteUrl } from "@/lib/shared"

export default async function robots(): Promise<MetadataRoute.Robots> {
	const { data, error } = await client.seo.robots()

	if (error) {
		return {
			rules: [{ userAgent: "*", allow: "/" }],
			sitemap: `${siteUrl}/sitemap_index.xml`,
		}
	}

	return {
		rules: data.rules.map((rule) => ({
			userAgent: rule.userAgent,
			allow: rule.allow,
			disallow: rule.disallow,
		})),
		sitemap: data.sitemaps.length > 0 ? data.sitemaps : `${siteUrl}/sitemap_index.xml`,
	}
}
