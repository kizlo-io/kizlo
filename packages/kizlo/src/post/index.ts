import { getPostTypeService } from "../post-type/service"
import { compare } from "../shared/crypto"
import { parseIdentifier } from "../shared/identifier"
import { createProcedure } from "../shared/procedure"
import { deserializeListMetadata } from "../shared/serialize"
import { GET_POST_ERROR_MAP, LIST_POST_ERROR_MAP } from "./error"
import { ListPostInput, Post, PostList, RetrievePostInput } from "./schema"
import type { WPK_Post } from "./types"
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
			const postType = getPostTypeService<WPK_Post>("post", context.service.wordpress)

			if (input.query?.previewToken) {
				const result = await context.verifyPreviewToken(input.query.previewToken)
				if (!result) throw errors.POST_NOT_FOUND()

				const response = await postType.get({ type: "id", value: result.id })
				if (response.error) {
					switch (response.error.code) {
						case "invalid_post_type":
						case "post_type_not_found":
						case "rest_post_invalid_id":
							throw errors.POST_NOT_FOUND()
						case "rest_post_incorrect_password":
							throw errors.POST_PASSWORD_INVALID()
						default:
							context.logger.error("Get post preview unhandled error", response.error, { id: result.id, code: response.error.code })
							throw errors.INTERNAL_SERVER_ERROR()
					}
				}

				return deserializePost({ ...response.data, password: "" }, { preview: true })
			}

			const identifier = parseIdentifier(input.params.identifier)
			if (!identifier) throw errors.POST_NOT_FOUND()

			const response = await postType.get(identifier)
			if (response.error) {
				switch (response.error.code) {
					case "invalid_post_type":
					case "post_type_not_found":
					case "rest_post_invalid_id":
						throw errors.POST_NOT_FOUND()
					case "rest_post_incorrect_password":
						throw errors.POST_PASSWORD_INVALID()
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
			const postType = getPostTypeService<WPK_Post>("post", context.service.wordpress)

			// Drop an orderby WP would reject for a missing companion param, so the list degrades instead of 400ing.
			const orderby =
				(q?.orderby === "relevance" && !q?.search) || (q?.orderby === "include" && q?.include === undefined) ? undefined : q?.orderby

			const response = await postType.list({
				context: "edit",
				status: "publish",
				after: input.query?.after,
				author: input.query?.author,
				author_exclude: input.query?.authorExclude,
				before: input.query?.before,
				modified_after: input.query?.modifiedAfter,
				modified_before: input.query?.modifiedBefore,
				categories: input.query?.categories,
				categories_exclude: input.query?.categoriesExclude,
				exclude: input.query?.exclude,
				include: input.query?.include,
				offset: input.query?.offset,
				order: input.query?.order,
				orderby,
				page: input.query?.page,
				per_page: input.query?.perPage,
				search: input.query?.search,
				search_columns: input.query?.searchColumns,
				slug: input.query?.slug,
				sticky: input.query?.sticky,
				tags: input.query?.tags,
				tags_exclude: input.query?.tagsExclude,
				tax_relation: input.query?.taxRelation,
			})

			if (response.error) {
				switch (response.error.code) {
					case "rest_post_invalid_page_number":
						throw errors.POST_INVALID_PAGE()
					default:
						context.logger.error("List posts unhandled error", response.error, { code: response.error.code })
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			const list = context.service.wordpress.resolveList({
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
