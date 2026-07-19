import { resolveWpTimestamp, stringifiedMetaRecord } from "@kizlo/shared"
import { deserializeSeo } from "../seo/utils"
import type { Post } from "./schema"
import type { WPK_Post } from "./types"

export function deserializePost(data: WPK_Post, options?: { preview?: boolean }): Post {
	const locked = data.password.length > 0
	const kizlo = data.kizlo
	const title = data.title.rendered

	return {
		id: data.id,
		url: kizlo.url ?? null,
		parent: data.parent ?? null,
		title: title.length > 0 ? title : null,
		content: locked ? null : (data.content?.rendered ?? null),
		excerpt: locked ? null : (data.excerpt?.rendered ?? null),
		protected: locked,
		preview: options?.preview ?? false,
		status: data.status === "trash" ? "draft" : data.status,
		featuredMedia: kizlo.featured_media ?? null,
		commentsEnabled: data.comment_status === "open",
		slug: data.slug,
		sticky: data.sticky ?? false,
		tags: kizlo.tags ?? [],
		categories: kizlo.categories ?? [],
		author: kizlo.author
			? {
					id: kizlo.author.id,
					name: kizlo.author.name,
					slug: kizlo.author.slug,
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
		createdAt: resolveWpTimestamp(data.date_gmt) ?? resolveWpTimestamp(data.modified_gmt) ?? 0,
		updatedAt: resolveWpTimestamp(data.modified_gmt) ?? 0,
		meta: stringifiedMetaRecord(data.meta ?? {}),
	}
}
