import { stringifiedMetaRecord } from "@kizlo/shared"
import { deserializeSeo } from "../seo/utils"
import type { Category } from "./schema"
import type { WPK_Category } from "./types"

export function deserializeCategory(data: WPK_Category): Category {
	return {
		id: data.id,
		name: data.name,
		slug: data.slug,
		url: data.kizlo.url ?? null,
		description: data.description.length > 0 ? data.description : null,
		parent: data.parent > 0 ? data.parent : null,
		postCount: data.count,
		seo: data.kizlo.seo ? deserializeSeo(data.kizlo.seo) : null,
		meta: stringifiedMetaRecord(data.meta ?? {}),
	}
}
