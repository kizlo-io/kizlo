import type { Metadata } from "next"
import type { SeoHead } from "../../seo/schema"

export function toMetadata(head: SeoHead): Metadata {
	const robots = [
		head.robots.index,
		head.robots.follow,
		head.robots.maxSnippet,
		head.robots.maxImagePreview,
		head.robots.maxVideoPreview,
	].join(", ")

	return {
		title: { absolute: head.title },
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
				? [
						{
							url: head.og.image.url,
							width: head.og.image.width,
							height: head.og.image.height,
							alt: head.og.image.alt ?? undefined,
						},
					]
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
