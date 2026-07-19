import { stringifiedMetaRecord } from "@kizlo/shared"
import { deserializeSeo } from "../seo/utils"
import type { Tag } from "./schema"
import type { WPK_Tag } from "./types"

export function deserializeTag(data: WPK_Tag): Tag {
	return {
		id: data.id,
		name: data.name,
		slug: data.slug,
		url: data.kizlo.url ?? null,
		description: data.description.length > 0 ? data.description : null,
		postCount: data.count,
		seo: data.kizlo.seo ? deserializeSeo(data.kizlo.seo) : null,
		meta: stringifiedMetaRecord(data.meta ?? {}),
	}
}
