import { normalizeArrayableValue } from "@kizlo/shared"
import { parseIdentifier } from "../shared/identifier"
import { createProcedure, schemaType } from "../shared/procedure"
import { deserializeListMetadata } from "../shared/serialize"
import { GET_CATEGORY_ERROR_MAP, LIST_CATEGORY_ERROR_MAP } from "./error"
import { Category, CategoryList, ListCategoryInput, RetrieveCategoryInput } from "./schema"
import { deserializeCategory } from "./utils"

export const CATEGORY_PROCEDURES = {
	get: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/categories/{identifier}",
			params: RetrieveCategoryInput.pick({ identifier: true }),
			output: schemaType<Category>(Category),
			errors: GET_CATEGORY_ERROR_MAP,
		},
		async ({ input, context, errors }) => {
			const identifier = parseIdentifier(input.params.identifier)
			if (!identifier) throw errors.CATEGORY_NOT_FOUND()

			const response = await context.wordpress.taxonomies.category.retrieve({ identifier: String(identifier.value) })
			if (response.error) {
				switch (response.error.code) {
					case "invalid_taxonomy":
					case "term_not_found":
					case "rest_term_invalid":
					case "rest_no_route":
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
			output: schemaType<CategoryList>(CategoryList),
			errors: LIST_CATEGORY_ERROR_MAP,
		},
		async ({ input, context, errors }) => {
			const response = await context.wordpress.taxonomies.category.list({
				page: input.query?.page,
				per_page: input.query?.perPage,
				search: input.query?.search,
				exclude: normalizeArrayableValue(input.query?.exclude),
				include: normalizeArrayableValue(input.query?.include),
				order: input.query?.order,
				orderby: input.query?.orderBy,
				hide_empty: input.query?.hideEmpty,
				parent: input.query?.parent,
				post: input.query?.post,
				slug: normalizeArrayableValue(input.query?.slug),
			})

			if (response.error) {
				switch (response.error.code) {
					case "rest_post_invalid_page_number":
						throw errors.CATEGORY_INVALID_PAGE()
					case "rest_no_route":
						throw errors.CATEGORY_NOT_FOUND()
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
