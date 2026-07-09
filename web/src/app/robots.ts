import type { MetadataRoute } from "next"
import { client } from "@/lib/kizlo/server"

export default async function robots(): Promise<MetadataRoute.Robots> {
	const data = await client.seo.robots.call()

	return {
		rules: data.rules.map((rule) => ({
			allow: rule.allow,
			disallow: rule.disallow,
			userAgent: rule.userAgent,
		})),
		...(data.sitemaps.length > 0 ? { sitemap: data.sitemaps } : {}),
	}
}
