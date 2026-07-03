import type { SeoHead, Sitemap, SitemapUrl } from "kizlo"
import type { Metadata } from "next"

// Index entries only need these fields to render; the WP `type` field is
// irrelevant here, which lets locally sourced sitemaps (e.g. docs) join in.
export type SitemapIndexEntry = Pick<Sitemap, "key" | "pages" | "lastmod">

const SITEMAP_SUFFIX = "-sitemap"

export function sitemapEntryPath(key: string, page: number): string {
	const suffix = page > 1 ? `${SITEMAP_SUFFIX}${page}` : SITEMAP_SUFFIX

	return `/${key}${suffix}.xml`
}

export function parseSitemapSlug(slug: string): { key: string; page: number } | null {
	const match = /^(.+)-sitemap(\d*)\.xml$/.exec(slug)

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

// Map a Kizlo SEO `head` (already resolved by the plugin) onto Next's Metadata.
// The plugin ships full robots directives (e.g. "max-snippet:-1"), so we join
// them into a single robots content string rather than re-deriving them.
export function toMetadata(head: SeoHead): Metadata {
	const robots = [
		head.robots.index,
		head.robots.follow,
		head.robots.maxSnippet,
		head.robots.maxImagePreview,
		head.robots.maxVideoPreview,
	].join(", ")

	return {
		title: head.title,
		description: head.og.description || undefined,
		alternates: { canonical: head.canonical },
		robots,
		openGraph: {
			type: head.og.type,
			title: head.og.title,
			description: head.og.description || undefined,
			url: head.og.url,
			siteName: head.og.siteName,
			locale: head.og.locale,
			images: head.og.image
				? [{ url: head.og.image.url, width: head.og.image.width, height: head.og.image.height, alt: head.og.image.alt ?? undefined }]
				: undefined,
		} as Metadata["openGraph"],
		twitter: {
			card: head.twitter.card,
			title: head.twitter.title,
			description: head.twitter.description || undefined,
			site: head.twitter.site ?? undefined,
			creator: head.twitter.creator ?? undefined,
			images: head.twitter.image ? [head.twitter.image] : undefined,
		},
	}
}

export function xmlResponse(body: string): Response {
	return new Response(body, {
		headers: {
			"Content-Type": "application/xml; charset=utf-8",
			"Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
		},
	})
}
