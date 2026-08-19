import { normalizeArrayableValue } from "@kizlo/shared"
import { compare } from "../shared/crypto"
import { parseIdentifier } from "../shared/identifier"
import { createProcedure } from "../shared/procedure"
import { deserializeListMetadata } from "../shared/serialize"
import { GET_POST_ERROR_MAP, LIST_POST_ERROR_MAP } from "./error"
import { ListPostInput, Post, PostList, RetrievePostInput } from "./schema"
import { deserializePost } from "./utils"

export const POST_ROUTER_MAP = {
	get: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/posts/{identifier}",
			params: RetrievePostInput.pick({ identifier: true }),
			query: RetrievePostInput.pick({ password: true, previewToken: true }).optional(),
			output: Post,
			errors: GET_POST_ERROR_MAP,
		},
		async ({ input, context, errors }) => {
			if (input.query?.previewToken) {
				const result = await context.verifyPreviewToken(input.query.previewToken)
				if (!result) throw errors.POST_NOT_FOUND()

				const response = await context.wordpress.postTypes.post.retrieve({ identifier: String(result.id) })

				if (response.error) {
					switch (response.error.code) {
						case "invalid_post_type":
						case "post_type_not_found":
						case "rest_post_invalid_id":
						case "rest_no_route":
							throw errors.POST_NOT_FOUND()
						default:
							context.logger.error("Get post preview unhandled error", response.error, { id: result.id, code: response.error.code })
							throw errors.INTERNAL_SERVER_ERROR()
					}
				}

				return deserializePost({ ...response.data, password: "" }, { preview: true })
			}

			const identifier = parseIdentifier(input.params.identifier)
			if (!identifier) throw errors.POST_NOT_FOUND()

			const response = await context.wordpress.postTypes.post.retrieve({ identifier: String(identifier.value) })
			if (response.error) {
				switch (response.error.code) {
					case "invalid_post_type":
					case "post_type_not_found":
					case "rest_post_invalid_id":
					case "rest_no_route":
						throw errors.POST_NOT_FOUND()
					default:
						context.logger.error("Get post unhandled error", response.error, { identifier, code: response.error.code })
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			const data = response.data

			if (data.status !== "publish") throw errors.POST_NOT_FOUND()

			if (input.query?.password && data.password) {
				const match = await compare(input.query.password, data.password)
				if (!match) throw errors.POST_PASSWORD_INVALID()

				return deserializePost({ ...data, password: "" })
			}

			return deserializePost(data)
		},
	),

	list: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/posts",
			query: ListPostInput.optional(),
			output: PostList,
			errors: LIST_POST_ERROR_MAP,
		},
		async ({ input, context, errors }) => {
			const q = input.query
			// Drop an orderby WP would reject for a missing companion param, so the list degrades instead of 400ing.
			const orderby =
				(q?.orderby === "relevance" && !q?.search) || (q?.orderby === "include" && q?.include === undefined) ? undefined : q?.orderby

			const response = await context.wordpress.postTypes.post.list({
				status: ["publish"],
				after: q?.after,
				author: normalizeArrayableValue(q?.author),
				author_exclude: normalizeArrayableValue(q?.authorExclude),
				before: q?.before,
				modified_after: q?.modifiedAfter,
				modified_before: q?.modifiedBefore,
				categories: normalizeArrayableValue(q?.categories),
				categories_exclude: normalizeArrayableValue(q?.categoriesExclude),
				exclude: normalizeArrayableValue(q?.exclude),
				include: normalizeArrayableValue(q?.include),
				offset: q?.offset,
				order: q?.order,
				orderby,
				page: q?.page,
				per_page: q?.perPage,
				search: q?.search,
				search_columns: q?.searchColumns,
				slug: normalizeArrayableValue(q?.slug),
				sticky: q?.sticky,
				tags: normalizeArrayableValue(q?.tags),
				tags_exclude: normalizeArrayableValue(q?.tagsExclude),
				tax_relation: q?.taxRelation,
			})

			if (response.error) {
				switch (response.error.code) {
					case "rest_post_invalid_page_number":
						throw errors.POST_INVALID_PAGE()
					case "rest_no_route":
						throw errors.POST_NOT_FOUND()
					default:
						context.logger.error("List posts unhandled error", response.error, { code: response.error.code })
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
				items: list.items.map((item) => deserializePost(item)),
			}
		},
	),
}
