import { stringifiedMetaRecord } from "@kizlo/shared"
import { deserializeSeo } from "../seo/utils"
import type { Tag } from "./schema"
import type { WPK_Tag, WPK_TagListItem } from "./types"

export function deserializeTag(data: WPK_Tag | WPK_TagListItem): Tag {
	return {
		id: data.id,
		name: data.name,
		slug: data.slug,
		url: data.kizlo.url,
		description: data.description.length > 0 ? data.description : null,
		postCount: data.count,
		// List responses carry no resolved SEO block; only a single fetch does.
		seo: "seo" in data.kizlo ? deserializeSeo(data.kizlo.seo) : null,
		custom: data.kizlo.custom,
		meta: stringifiedMetaRecord(data.meta),
	}
}
