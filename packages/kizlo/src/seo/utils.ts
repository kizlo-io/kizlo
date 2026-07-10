import type { Robots, Seo, Sitemap, SitemapUrl } from "./schema"
import type { WPK_Seo } from "./types"

export function deserializeSeo(data: WPK_Seo): Seo {
	return {
		head: {
			article: data.head.article
				? {
						author: data.head.article.author,
						authorUrl: data.head.article.author_url,
						modifiedTime: data.head.article.modified_time,
						publishedTime: data.head.article.published_time,
						section: data.head.article.section,
					}
				: null,
			canonical: data.head.canonical,
			og: {
				description: data.head.og.description,
				image: data.head.og.image ?? null,
				locale: data.head.og.locale,
				siteName: data.head.og.site_name,
				title: data.head.og.title,
				type: data.head.og.type,
				url: data.head.og.url,
			},
			robots: {
				index: data.head.robots.index,
				follow: data.head.robots.follow,
				maxSnippet: data.head.robots["max-snippet"],
				maxImagePreview: data.head.robots["max-image-preview"],
				maxVideoPreview: data.head.robots["max-video-preview"],
			},
			title: data.head.title,
			twitter: {
				card: data.head.twitter.card,
				creator: data.head.twitter.creator,
				description: data.head.twitter.description,
				image: data.head.twitter.image ?? null,
				site: data.head.twitter.site,
				title: data.head.twitter.title,
			},
		},
		schema: data.schema,
	}
}

export type SitemapIndexEntry = Pick<Sitemap, "key" | "pages" | "lastmod">

// Slug scheme: page 1 is `/sitemaps/{key}.xml`, later pages are `/sitemaps/{key}-{n}.xml`.
// The `-{n}` separator keeps parsing unambiguous (a bare numeric suffix lets a greedy
// match swallow the page into the key). `parseSitemapSlug` is the inverse and the two
// must stay in lockstep: the index `<loc>` entries are built by `sitemapEntryPath` and
// read back through `parseSitemapSlug`.
export function sitemapEntryPath(key: string, page: number): string {
	return `/sitemaps/${key}${page > 1 ? `-${page}` : ""}.xml`
}

export function parseSitemapSlug(slug: string): { key: string; page: number } | null {
	const match = /^(.+?)(?:-(\d+))?\.xml$/.exec(slug)

	if (!match) return null

	const [, key, rawPage] = match
	const page = rawPage ? Number(rawPage) : 1

	if (!key || !Number.isInteger(page) || page < 1) return null

	return { key, page }
}

function escapeXml(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")
}

export function renderSitemapIndex(sitemaps: readonly SitemapIndexEntry[], origin: string): string {
	const entries = sitemaps.flatMap((sitemap) =>
		Array.from({ length: sitemap.pages }, (_, index) => {
			const loc = `${origin}${sitemapEntryPath(sitemap.key, index + 1)}`

			return `\t<sitemap>\n\t\t<loc>${escapeXml(loc)}</loc>\n\t\t<lastmod>${escapeXml(sitemap.lastmod)}</lastmod>\n\t</sitemap>`
		}),
	)

	return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</sitemapindex>\n`
}

export function renderUrlSet(urls: SitemapUrl[]): string {
	const entries = urls.map((url) => {
		const images = url.images
			.map((image) => `\t\t<image:image>\n\t\t\t<image:loc>${escapeXml(image.loc)}</image:loc>\n\t\t</image:image>`)
			.join("\n")

		const imageBlock = images ? `\n${images}` : ""

		return `\t<url>\n\t\t<loc>${escapeXml(url.loc)}</loc>\n\t\t<lastmod>${escapeXml(url.lastmod)}</lastmod>${imageBlock}\n\t</url>`
	})

	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${entries.join("\n")}\n</urlset>\n`
}

export function xmlResponse(body: string): Response {
	return new Response(body, {
		headers: {
			"Content-Type": "application/xml; charset=utf-8",
		},
	})
}

export function renderRobots(robots: Robots): string {
	const groups = robots.rules.map((rule) => {
		const lines = [`User-agent: ${rule.userAgent}`]
		for (const path of rule.allow) lines.push(`Allow: ${path}`)
		for (const path of rule.disallow) lines.push(`Disallow: ${path}`)
		return lines.join("\n")
	})

	const sitemaps = robots.sitemaps.map((url) => `Sitemap: ${url}`).join("\n")
	const blocks = [groups.join("\n\n"), sitemaps].filter(Boolean)

	return `${blocks.join("\n\n")}\n`
}

// Default lets a shared CDN cache the response for an hour (with SWR). Pass an explicit
// `cacheControl` when the caller owns invalidation itself (e.g. Next's `revalidateTag`),
// since a CDN entry minted by `s-maxage` cannot be purged by tag revalidation and would
// keep serving stale until its TTL expires. See the Next robots wrapper.
export function textResponse(body: string): Response {
	return new Response(body, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
		},
	})
}
