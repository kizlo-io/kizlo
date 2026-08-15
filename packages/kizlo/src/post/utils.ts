import { resolveWpTimestamp, stringifiedMetaRecord } from "@kizlo/shared"
import { publicPostStatus } from "../post-type/status"
import { deserializeSeo } from "../seo/utils"
import type { Post } from "./schema"
import type { WPK_Post, WPK_PostListItem } from "./types"

export function deserializePost(data: WPK_Post | WPK_PostListItem, options?: { preview?: boolean }): Post {
	const locked = data.password.length > 0
	const kizlo = data.kizlo
	const title = data.title.rendered

	return {
		id: data.id,
		url: kizlo.url,
		// WordPress posts are not hierarchical, so the REST response carries no parent.
		parent: null,
		title: title.length > 0 ? title : null,
		content: locked ? null : data.content.rendered,
		excerpt: locked ? null : data.excerpt.rendered,
		protected: locked,
		preview: options?.preview ?? false,
		status: publicPostStatus(data.status),
		featuredMedia: kizlo.featured_media ?? null,
		commentsEnabled: data.comment_status === "open",
		slug: data.slug,
		sticky: data.sticky,
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
		format: data.format,
		// List responses carry no resolved SEO block; only a single fetch does.
		seo: "seo" in kizlo ? deserializeSeo(kizlo.seo) : null,
		createdAt: resolveWpTimestamp(data.date_gmt) ?? resolveWpTimestamp(data.modified_gmt) ?? 0,
		updatedAt: resolveWpTimestamp(data.modified_gmt) ?? 0,
		meta: stringifiedMetaRecord(data.meta),
	}
}
