import { stringifiedMetaRecord } from "@kizlo/shared"
import { deserializeSeo } from "../seo/utils"
import type { Post } from "./schema"
import type { WPK_Post } from "./types"

export function deserializePost(data: WPK_Post): Post {
	return {
		id: data.id,
		title: data.title.rendered,
		content: !data.password.length ? (data.content?.rendered ?? null) : null,
		excerpt: !data.password.length ? data.excerpt.rendered : null,
		protected: !!data.password.length,
		featuredMedia: data.kizlo?.featured_media
			? {
					id: data.kizlo.featured_media.id,
					alt: data.kizlo.featured_media.alt,
					name: data.title.rendered,
					src: data.kizlo.featured_media.url,
				}
			: null,
		commentsEnabled: data.comment_status === "open",
		slug: data.slug,
		sticky: data.sticky ?? false,
		tags: data.kizlo.tags ?? [],
		categories: data.kizlo.categories ?? [],
		author: data.kizlo.author
			? {
					id: data.kizlo.author.id,
					name: data.kizlo.author.name,
					avatar: data.kizlo.author.avatar_url
						? {
								id: 0,
								alt: data.kizlo.author.name,
								name: data.kizlo.author.name,
								src: data.kizlo.author.avatar_url,
							}
						: null,
				}
			: null,
		format: data.format ?? "standard",
		seo: data.kizlo.seo ? deserializeSeo(data.kizlo.seo) : null,
		createdAt: new Date(data.date ?? "").getTime(),
		updatedAt: new Date(data.modified ?? "").getTime(),
		meta: stringifiedMetaRecord(data.meta ?? {}),
	}
}
