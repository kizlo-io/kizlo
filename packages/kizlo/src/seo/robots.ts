import type { PublicApiClient } from "../public-api"
import { requireData } from "../wordpress/utils"

export const ROBOTS_ROUTE = "/robots.txt" as const

export function createRobotsRoute(client: PublicApiClient) {
	return async function GET(_request: Request): Promise<Response> {
		const data = requireData(await client.kizlo.seo.robots.retrieve())

		const groups = data.rules.map((rule) => {
			const lines = [`User-agent: ${rule.user_agent}`]
			for (const path of rule.allow) lines.push(`Allow: ${path}`)
			for (const path of rule.disallow) lines.push(`Disallow: ${path}`)
			return lines.join("\n")
		})

		const sitemaps = (data.sitemaps ?? []).map((url) => `Sitemap: ${url}`).join("\n")
		const blocks = [groups.join("\n\n"), sitemaps].filter(Boolean)

		return new Response(`${blocks.join("\n\n")}\n`, {
			headers: {
				"Content-Type": "text/plain; charset=utf-8",
			},
		})
	}
}
