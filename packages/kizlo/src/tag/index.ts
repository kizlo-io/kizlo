import { parseIdentifier } from "../shared/identifier"
import { createProcedure } from "../shared/procedure"
import { deserializeListMetadata } from "../shared/serialize"
import { getTaxonomyService } from "../taxonomy/service"
import { GET_TAG_ERROR_MAP, LIST_TAG_ERROR_MAP } from "./error"
import { ListTagInput, RetrieveTagInput, Tag, TagList } from "./schema"
import type { WPK_Tag } from "./types"
import { deserializeTag } from "./utils"

export const TAG_ROUTER_MAP = {
	get: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/tags/{identifier}",
			params: RetrieveTagInput.pick({ identifier: true }),
			output: Tag,
			errors: GET_TAG_ERROR_MAP,
		},
		async ({ input, context, errors }) => {
			const taxonomy = getTaxonomyService<WPK_Tag>("post_tag", context.wordpress)

			const identifier = parseIdentifier(input.params.identifier)
			if (!identifier) throw errors.TAG_NOT_FOUND()

			const response = await taxonomy.get(identifier)
			if (response.error) {
				switch (response.error.code) {
					case "invalid_taxonomy":
					case "term_not_found":
					case "rest_term_invalid":
						throw errors.TAG_NOT_FOUND()
					default:
						context.logger.error("Get tag unhandled error", response.error, { identifier, code: response.error.code })
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			return deserializeTag(response.data)
		},
	),

	list: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/tags",
			query: ListTagInput.optional(),
			output: TagList,
			errors: LIST_TAG_ERROR_MAP,
		},
		async ({ input, context, errors }) => {
			const taxonomy = getTaxonomyService<WPK_Tag>("post_tag", context.wordpress)

			const response = await taxonomy.list({
				context: "edit",
				page: input.query?.page,
				per_page: input.query?.perPage,
				search: input.query?.search,
				exclude: input.query?.exclude,
				include: input.query?.include,
				order: input.query?.order,
				orderby: input.query?.orderBy,
				hide_empty: input.query?.hideEmpty,
				post: input.query?.post,
				slug: input.query?.slug,
			})

			if (response.error) {
				switch (response.error.code) {
					case "rest_post_invalid_page_number":
						throw errors.TAG_INVALID_PAGE()
					default:
						context.logger.error("List tags unhandled error", response.error, { code: response.error.code })
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			const list = context.wordpress.resolveList({
				data: response.data,
				headers: response.headers,
				searchParams: input.query,
			})

			return {
				meta: deserializeListMetadata(list.meta),
				items: list.items.map((item) => deserializeTag(item)),
			}
		},
	),
}
