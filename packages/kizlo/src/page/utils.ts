import { stringifiedMetaRecord, timestampFromWpGmt } from "@kizlo/shared"
import { publicPostStatus } from "../post-type/status"
import { deserializeSeo } from "../seo/utils"
import type { Page } from "./schema"
import type { WPK_Page, WPK_PageListItem } from "./types"

export function deserializePage(data: WPK_Page | WPK_PageListItem, options?: { preview?: boolean }): Page {
	const locked = data.password.length > 0
	const kizlo = data.kizlo
	const title = data.title.rendered

	return {
		id: data.id,
		url: kizlo.url,
		parent: data.parent || null,
		menuOrder: data.menu_order,
		template: data.template,
		title: title.length > 0 ? title : null,
		content: locked ? null : data.content.rendered,
		excerpt: locked ? null : data.excerpt.rendered,
		protected: locked,
		preview: options?.preview ?? false,
		status: publicPostStatus(data.status),
		featuredMedia: kizlo.featured_media ?? null,
		commentsEnabled: data.comment_status === "open",
		slug: data.slug,
		author: kizlo.author
			? {
					id: kizlo.author.id,
					name: kizlo.author.name,
					slug: kizlo.author.slug,
					avatarUrl: kizlo.author.avatar_url || null,
				}
			: null,
		// List responses carry no resolved SEO block; only a single fetch does.
		seo: "seo" in kizlo ? deserializeSeo(kizlo.seo) : null,
		createdAt: timestampFromWpGmt(data.date_gmt) ?? timestampFromWpGmt(data.modified_gmt) ?? 0,
		updatedAt: timestampFromWpGmt(data.modified_gmt) ?? 0,
		meta: stringifiedMetaRecord(data.meta),
	}
}
