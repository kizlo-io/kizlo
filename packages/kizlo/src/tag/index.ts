import { normalizeArrayableValue } from "@kizlo/shared"
import { parseIdentifier } from "../shared/identifier"
import { createProcedure, schemaType } from "../shared/procedure"
import { deserializeListMetadata } from "../shared/serialize"
import { GET_TAG_ERROR_MAP, LIST_TAG_ERROR_MAP } from "./error"
import { ListTagInput, RetrieveTagInput, Tag, TagList } from "./schema"
import { deserializeTag } from "./utils"

export const TAG_PROCEDURES = {
	get: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/tags/{identifier}",
			params: RetrieveTagInput.pick({ identifier: true }),
			output: schemaType<Tag>(Tag),
			errors: GET_TAG_ERROR_MAP,
		},
		async ({ input, context, errors }) => {
			const identifier = parseIdentifier(input.params.identifier)
			if (!identifier) throw errors.TAG_NOT_FOUND()

			const response = await context.wordpress.taxonomies.postTag.retrieve({ identifier: String(identifier.value) })
			if (response.error) {
				switch (response.error.code) {
					case "invalid_taxonomy":
					case "term_not_found":
					case "rest_term_invalid":
					case "rest_no_route":
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
			output: schemaType<TagList>(TagList),
			errors: LIST_TAG_ERROR_MAP,
		},
		async ({ input, context, errors }) => {
			const response = await context.wordpress.taxonomies.postTag.list({
				page: input.query?.page,
				per_page: input.query?.perPage,
				search: input.query?.search,
				exclude: normalizeArrayableValue(input.query?.exclude),
				include: normalizeArrayableValue(input.query?.include),
				order: input.query?.order,
				orderby: input.query?.orderBy,
				hide_empty: input.query?.hideEmpty,
				post: input.query?.post,
				slug: normalizeArrayableValue(input.query?.slug),
			})

			if (response.error) {
				switch (response.error.code) {
					case "rest_post_invalid_page_number":
						throw errors.TAG_INVALID_PAGE()
					case "rest_no_route":
						throw errors.TAG_NOT_FOUND()
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
