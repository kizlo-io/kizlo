import { resolveWpTimestamp, stringifiedMetaRecord } from "@kizlo/shared"
import { deserializeSeo } from "../seo/utils"
import type { Post } from "./schema"
import type { WPK_Post } from "./types"

export function deserializePost(data: WPK_Post): Post {
	const locked = data.password.length > 0
	const kizlo = data.kizlo

	return {
		id: data.id,
		title: data.title.rendered,
		content: locked ? null : (data.content?.rendered ?? null),
		excerpt: locked ? null : (data.excerpt?.rendered ?? null),
		protected: locked,
		featuredMedia: kizlo.featured_media
			? {
					id: kizlo.featured_media.id,
					alt: kizlo.featured_media.alt,
					name: data.title.rendered,
					src: kizlo.featured_media.url,
				}
			: null,
		commentsEnabled: data.comment_status === "open",
		slug: data.slug,
		sticky: data.sticky ?? false,
		tags: kizlo.tags ?? [],
		categories: kizlo.categories ?? [],
		author: kizlo.author
			? {
					id: kizlo.author.id,
					name: kizlo.author.name,
					avatar: kizlo.author.avatar_url
						? {
								id: 0,
								alt: kizlo.author.name,
								name: kizlo.author.name,
								src: kizlo.author.avatar_url,
							}
						: null,
				}
			: null,
		format: data.format ?? "standard",
		seo: kizlo.seo ? deserializeSeo(kizlo.seo) : null,
		createdAt: resolveWpTimestamp(data.date) ?? resolveWpTimestamp(data.modified) ?? 0,
		updatedAt: resolveWpTimestamp(data.modified) ?? 0,
		meta: stringifiedMetaRecord(data.meta ?? {}),
	}
}
