import { createProcedure } from "../shared/procedure"
import { deserializeListMetadata } from "../shared/serialize"
import type {
	WP_CommentCreateErrorCode,
	WP_CommentListErrorCode,
	WP_CommentListInput,
	WP_CommentRetrieveErrorCode,
	WP_CommentRetrieveInput,
} from "../wordpress"
import { WP_CORE_BASE, WP_KIZLO_BASE } from "../wordpress/constants"
import { GET_COMMENT_ERROR_MAP, LIST_COMMENT_ERROR_MAP, SUBMIT_COMMENT_ERROR_MAP } from "./errors"
import { Comment, CommentList, GetCommentInput, ListCommentInput, SubmitCommentInput } from "./schema"
import type { WPK_Comment, WPK_CreateCommentInput } from "./types"
import { deserializeComment } from "./utils"

export const COMMENT_ROUTER_MAP = {
	get: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/comments/{id}",
			params: GetCommentInput.pick({ id: true }),
			query: GetCommentInput.pick({ password: true }).optional(),
			errors: GET_COMMENT_ERROR_MAP,
			output: Comment,
		},
		async ({ context, errors, input }) => {
			const response = await context.service.wordpress.get<WPK_Comment, WP_CommentRetrieveErrorCode>(`/comments/${input.params.id}`, {
				base: WP_CORE_BASE,
				searchParams: { password: input.query?.password } satisfies Omit<WP_CommentRetrieveInput, "id">,
			})
			if (response.error) {
				switch (response.error.code) {
					case "rest_comment_invalid_id":
					case "rest_post_invalid_id": {
						throw errors.COMMENT_NOT_FOUND()
					}
					case "rest_cannot_read":
					case "rest_cannot_read_post": {
						throw errors.COMMENT_FORBIDDEN()
					}
					default:
						context.logger.error("Get comment unhandled error", response.error, { commentId: input.params.id, code: response.error.code })
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			return deserializeComment(response.data)
		},
	),

	list: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/comments",
			query: ListCommentInput.optional(),
			errors: LIST_COMMENT_ERROR_MAP,
			output: CommentList,
		},
		async ({ context, errors, input }) => {
			const response = await context.service.wordpress.get<WPK_Comment[], WP_CommentListErrorCode>(`/comments`, {
				base: WP_CORE_BASE,
				searchParams: {
					context: "edit",
					after: input.query?.after,
					author: input.query?.author,
					author_exclude: input.query?.authorExclude,
					before: input.query?.before,
					exclude: input.query?.exclude,
					include: input.query?.include,
					offset: input.query?.offset,
					order: input.query?.order,
					orderby: input.query?.orderby,
					page: input.query?.page,
					parent: input.query?.parent,
					parent_exclude: input.query?.parentExclude,
					password: input.query?.password,
					per_page: input.query?.perPage,
					post: input.query?.post,
					search: input.query?.search,
				} satisfies WP_CommentListInput,
			})
			if (response.error) {
				switch (response.error.code) {
					case "rest_cannot_read":
					case "rest_cannot_read_post":
					case "rest_forbidden_context":
					case "rest_forbidden_param": {
						throw errors.COMMENT_FORBIDDEN()
					}
					case "rest_comment_not_supported_post_type": {
						throw errors.COMMENT_POST_TYPE_NOT_SUPPORTED()
					}
					default:
						context.logger.error("List comments unhandled error", response.error, { code: response.error.code })
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			const list = context.service.wordpress.resolveList({
				data: response.data,
				headers: response.headers,
				searchParams: input.query,
			})

			return { items: list.items.map(deserializeComment), meta: deserializeListMetadata(list.meta) }
		},
	),

	submit: createProcedure(
		{
			scope: "api",
			method: "POST",
			path: "/comments",
			body: SubmitCommentInput,
			errors: SUBMIT_COMMENT_ERROR_MAP,
			output: Comment,
		},
		async ({ context, errors, input }) => {
			const connInfo = await context.getConnInfo()
			if (!connInfo?.ip) throw new Error("Connection IP is required.")
			if (!connInfo?.userAgent) throw new Error("Connection user agent is required.")

			const user = await context.getAuthUser()

			if (!user) {
				if (!input.body.captchaToken) throw errors.COMMENT_CAPTCHA_REQUIRED()
				const valid = await context.verifyCaptcha(input.body.captchaToken)
				if (!valid) throw errors.COMMENT_CAPTCHA_INVALID()
			}

			const response = await context.service.wordpress.post<WPK_Comment, WP_CommentCreateErrorCode>(`/comments`, {
				body: {
					user_id: user?.id,
					author_ip: connInfo.ip,
					user_agent: connInfo.userAgent,
					content: input.body.content,
					post_id: input.body.postId,
					author_email: input.body.authorEmail,
					author_name: input.body.authorName,
					author_url: input.body.authorUrl,
					parent: input.body.parentId,
				} satisfies WPK_CreateCommentInput,
				base: WP_KIZLO_BASE,
			})
			if (response.error) {
				switch (response.error.code) {
					case "rest_comment_author_data_required": {
						throw errors.COMMENT_NAME_EMAIL_REQUIRED()
					}
					case "rest_comment_author_invalid":
					case "rest_comment_invalid_author": {
						throw errors.COMMENT_USER_NOT_FOUND()
					}
					case "rest_comment_content_invalid": {
						throw errors.COMMENT_EMPTY_CONTENT()
					}
					case "rest_comment_login_required": {
						throw errors.COMMENT_LOGIN_REQUIRED()
					}
					case "rest_comment_closed": {
						throw errors.COMMENT_CLOSED()
					}
					case "rest_cannot_read_post":
					case "rest_comment_draft_post":
					case "rest_comment_invalid_post_id":
					case "rest_comment_not_supported_post_type":
					case "rest_comment_trash_post": {
						throw errors.COMMENT_ID_NOT_FOUND()
					}
					default:
						context.logger.error("Submit comment unhandled error", response.error, { code: response.error.code })
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			return deserializeComment(response.data)
		},
	),
}
