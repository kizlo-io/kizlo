import type { MetadataRoute } from "next"
import { client } from "@/lib/kizlo/server"

export const dynamic = "force-static"

export default async function robots(): Promise<MetadataRoute.Robots> {
	const data = await client.seo.robots.call()

	return {
		rules: data.rules.map((rule) => ({
			userAgent: rule.userAgent,
			allow: rule.allow,
			disallow: rule.disallow,
		})),
		sitemap: data.sitemaps,
	}
}
