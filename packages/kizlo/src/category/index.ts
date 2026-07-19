import { parseIdentifier } from "../shared/identifier"
import { createProcedure } from "../shared/procedure"
import { deserializeListMetadata } from "../shared/serialize"
import { getTaxonomyService } from "../taxonomy/service"
import { GET_CATEGORY_ERROR_MAP, LIST_CATEGORY_ERROR_MAP } from "./error"
import { Category, CategoryList, ListCategoryInput, RetrieveCategoryInput } from "./schema"
import type { WPK_Category } from "./types"
import { deserializeCategory } from "./utils"

export const CATEGORY_ROUTER_MAP = {
	get: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/categories/{identifier}",
			params: RetrieveCategoryInput.pick({ identifier: true }),
			output: Category,
			errors: GET_CATEGORY_ERROR_MAP,
		},
		async ({ input, context, errors }) => {
			const taxonomy = getTaxonomyService<WPK_Category>("category", context.wordpress)

			const identifier = parseIdentifier(input.params.identifier)
			if (!identifier) throw errors.CATEGORY_NOT_FOUND()

			const response = await taxonomy.get(identifier)
			if (response.error) {
				switch (response.error.code) {
					case "invalid_taxonomy":
					case "term_not_found":
					case "rest_term_invalid":
						throw errors.CATEGORY_NOT_FOUND()
					default:
						context.logger.error("Get category unhandled error", response.error, { identifier, code: response.error.code })
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			return deserializeCategory(response.data)
		},
	),

	list: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/categories",
			query: ListCategoryInput.optional(),
			output: CategoryList,
			errors: LIST_CATEGORY_ERROR_MAP,
		},
		async ({ input, context, errors }) => {
			const taxonomy = getTaxonomyService<WPK_Category>("category", context.wordpress)

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
				parent: input.query?.parent,
				post: input.query?.post,
				slug: input.query?.slug,
			})

			if (response.error) {
				switch (response.error.code) {
					case "rest_post_invalid_page_number":
						throw errors.CATEGORY_INVALID_PAGE()
					default:
						context.logger.error("List categories unhandled error", response.error, { code: response.error.code })
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
				items: list.items.map((item) => deserializeCategory(item)),
			}
		},
	),
}
