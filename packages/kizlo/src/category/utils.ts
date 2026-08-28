import { stringifiedMetaRecord } from "@kizlo/shared"
import { deserializeSeo } from "../seo/utils"
import type { Category } from "./schema"
import type { WPK_Category, WPK_CategoryListItem } from "./types"

export function deserializeCategory(data: WPK_Category | WPK_CategoryListItem): Category {
	return {
		id: data.id,
		name: data.name,
		slug: data.slug,
		url: data.kizlo.url,
		description: data.description.length > 0 ? data.description : null,
		parent: data.parent > 0 ? data.parent : null,
		postCount: data.count,
		// List responses carry no resolved SEO block; only a single fetch does.
		seo: "seo" in data.kizlo ? deserializeSeo(data.kizlo.seo) : null,
		custom: data.kizlo.custom,
		meta: stringifiedMetaRecord(data.meta),
	}
}
