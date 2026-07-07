import type { MetadataRoute } from "next"
import { client } from "@/lib/kizlo/server"

export const dynamic = "force-dynamic"

export default async function robots(): Promise<MetadataRoute.Robots> {
	const data = await client.seo.robots.call()

	return {
		rules: data.rules.map((rule) => ({
			userAgent: rule.userAgent,
			allow: rule.allow,
			disallow: rule.disallow,
		})),
		// The API omits sitemaps when "Include Sitemap" is off; honor that instead
		// of re-adding a hardcoded one.
		...(data.sitemaps.length > 0 ? { sitemap: data.sitemaps } : {}),
	}
}
