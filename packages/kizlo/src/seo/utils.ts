import type { Seo } from "./schema"
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
