import { normalizeArrayableValue } from "@kizlo/shared"
import { compare } from "../shared/crypto"
import { parseIdentifier } from "../shared/identifier"
import { createProcedure } from "../shared/procedure"
import { deserializeListMetadata } from "../shared/serialize"
import { GET_PAGE_ERROR_MAP, LIST_PAGE_ERROR_MAP } from "./error"
import { ListPageInput, Page, PageList, RetrievePageInput } from "./schema"
import { deserializePage } from "./utils"

export const PAGE_ROUTER_MAP = {
	get: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/pages/{identifier}",
			params: RetrievePageInput.pick({ identifier: true }),
			query: RetrievePageInput.pick({ password: true, previewToken: true }).optional(),
			output: Page,
			errors: GET_PAGE_ERROR_MAP,
		},
		async ({ input, context, errors }) => {
			if (input.query?.previewToken) {
				const result = await context.verifyPreviewToken(input.query.previewToken)
				if (!result) throw errors.PAGE_NOT_FOUND()

				const response = await context.wordpress.postTypes.page.retrieve({ identifier: String(result.id) })
				if (response.error) {
					switch (response.error.code) {
						case "invalid_post_type":
						case "post_type_not_found":
						case "rest_post_invalid_id":
						case "rest_no_route":
							throw errors.PAGE_NOT_FOUND()
						case "rest_post_incorrect_password":
							throw errors.PAGE_PASSWORD_INVALID()
						default:
							context.logger.error("Get page preview unhandled error", response.error, { id: result.id, code: response.error.code })
							throw errors.INTERNAL_SERVER_ERROR()
					}
				}

				return deserializePage({ ...response.data, password: "" }, { preview: true })
			}

			const identifier = parseIdentifier(input.params.identifier)
			if (!identifier) throw errors.PAGE_NOT_FOUND()

			const response = await context.wordpress.postTypes.page.retrieve({ identifier: String(identifier.value) })
			if (response.error) {
				switch (response.error.code) {
					case "invalid_post_type":
					case "post_type_not_found":
					case "rest_post_invalid_id":
					case "rest_no_route":
						throw errors.PAGE_NOT_FOUND()
					case "rest_post_incorrect_password":
						throw errors.PAGE_PASSWORD_INVALID()
					default:
						context.logger.error("Get page unhandled error", response.error, { identifier, code: response.error.code })
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			const data = response.data

			if (data.status !== "publish") throw errors.PAGE_NOT_FOUND()

			if (input.query?.password && data.password) {
				const match = await compare(input.query.password, data.password)
				if (!match) throw errors.PAGE_PASSWORD_INVALID()

				return deserializePage({ ...data, password: "" })
			}

			return deserializePage(data)
		},
	),

	list: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/pages",
			query: ListPageInput.optional(),
			output: PageList,
			errors: LIST_PAGE_ERROR_MAP,
		},
		async ({ input, context, errors }) => {
			const q = input.query
			// Drop an orderby WP would reject for a missing companion param, so the list degrades instead of 400ing.
			const orderby =
				(q?.orderby === "relevance" && !q?.search) || (q?.orderby === "include" && q?.include === undefined) ? undefined : q?.orderby

			const response = await context.wordpress.postTypes.page.list({
				status: ["publish"],
				after: q?.after,
				author: normalizeArrayableValue(q?.author),
				author_exclude: normalizeArrayableValue(q?.authorExclude),
				before: q?.before,
				modified_after: q?.modifiedAfter,
				modified_before: q?.modifiedBefore,
				exclude: normalizeArrayableValue(q?.exclude),
				include: normalizeArrayableValue(q?.include),
				menu_order: q?.menuOrder,
				offset: q?.offset,
				order: q?.order,
				orderby,
				page: q?.page,
				parent: normalizeArrayableValue(q?.parent),
				parent_exclude: normalizeArrayableValue(q?.parentExclude),
				per_page: q?.perPage,
				search: q?.search,
				search_columns: q?.searchColumns,
				slug: normalizeArrayableValue(q?.slug),
			})

			if (response.error) {
				switch (response.error.code) {
					case "rest_post_invalid_page_number":
						throw errors.PAGE_INVALID_PAGE()
					case "rest_no_route":
						throw errors.PAGE_NOT_FOUND()
					default:
						context.logger.error("List pages unhandled error", response.error, { code: response.error.code })
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
				items: list.items.map((item) => deserializePage(item)),
			}
		},
	),
}
