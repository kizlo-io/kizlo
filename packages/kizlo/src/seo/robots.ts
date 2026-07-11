import type { S2SClient } from "../kizlo"

export const ROBOTS_ROUTE = "/robots.txt" as const

export function createRobotsRoute(client: S2SClient<[]>) {
	return async function GET(_request: Request): Promise<Response> {
		const data = await client.seo.robots.call()

		const groups = data.rules.map((rule) => {
			const lines = [`User-agent: ${rule.userAgent}`]
			for (const path of rule.allow) lines.push(`Allow: ${path}`)
			for (const path of rule.disallow) lines.push(`Disallow: ${path}`)
			return lines.join("\n")
		})

		const sitemaps = data.sitemaps.map((url) => `Sitemap: ${url}`).join("\n")
		const blocks = [groups.join("\n\n"), sitemaps].filter(Boolean)

		return new Response(`${blocks.join("\n\n")}\n`, {
			headers: {
				"Content-Type": "text/plain; charset=utf-8",
			},
		})
	}
}
