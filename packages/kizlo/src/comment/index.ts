import { listed } from "@kizlo/shared"
import { createProcedure } from "../shared/procedure"
import { deserializeListMetadata } from "../shared/serialize"
import { GET_COMMENT_ERROR_MAP, LIST_COMMENT_ERROR_MAP, SUBMIT_COMMENT_ERROR_MAP } from "./errors"
import { Comment, CommentList, GetCommentInput, ListCommentInput, SubmitCommentInput } from "./schema"
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
			const response = await context.wordpress.comments.retrieve({
				id: input.params.id,
				password: input.query?.password,
			})
			if (response.error) {
				switch (response.error.code) {
					case "rest_comment_invalid_id":
					case "rest_post_invalid_id":
					case "rest_no_route": {
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

			const comment = deserializeComment(response.data)
			if (!comment) throw errors.COMMENT_NOT_FOUND()

			return comment
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
			const searchParams = {
				after: input.query?.after,
				author: listed(input.query?.author),
				author_exclude: listed(input.query?.authorExclude),
				before: input.query?.before,
				exclude: listed(input.query?.exclude),
				include: listed(input.query?.include),
				offset: input.query?.offset,
				order: input.query?.order,
				orderby: input.query?.orderby,
				page: input.query?.page,
				parent: listed(input.query?.parent),
				parent_exclude: listed(input.query?.parentExclude),
				password: input.query?.password,
				per_page: input.query?.perPage,
				post: listed(input.query?.post),
				search: input.query?.search,
			}

			const response = await context.wordpress.comments.list(searchParams)
			if (response.error) {
				switch (response.error.code) {
					case "rest_cannot_read":
					case "rest_cannot_read_post":
					case "rest_forbidden_param": {
						throw errors.COMMENT_FORBIDDEN()
					}
					case "rest_comment_not_supported_post_type": {
						throw errors.COMMENT_POST_TYPE_NOT_SUPPORTED()
					}
					case "rest_no_route": {
						throw errors.NOT_FOUND()
					}
					default:
						context.logger.error("List comments unhandled error", response.error, { code: response.error.code })
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			const list = context.wordpress.resolveList({ data: response.data, headers: response.headers, searchParams })

			// A comment whose post is gone has nothing to link to, so it drops out of the list.
			const items = list.items.flatMap((item) => {
				const comment = deserializeComment(item)
				return comment ? [comment] : []
			})

			return { items, meta: deserializeListMetadata(list.meta) }
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

			const response = await context.wordpress.kizlo.comments.create({
				user_id: user?.id,
				author_ip: connInfo.ip,
				user_agent: connInfo.userAgent,
				content: input.body.content,
				post_id: input.body.postId,
				author_email: input.body.authorEmail,
				author_name: input.body.authorName,
				author_url: input.body.authorUrl,
				parent: input.body.parentId,
			})
			if (response.error) {
				switch (response.error.code) {
					case "require_name_email": {
						throw errors.COMMENT_NAME_EMAIL_REQUIRED()
					}
					case "require_valid_email": {
						throw errors.COMMENT_INVALID_EMAIL()
					}
					case "kizlo_invalid_user": {
						throw errors.COMMENT_USER_NOT_FOUND()
					}
					case "require_valid_comment": {
						throw errors.COMMENT_EMPTY_CONTENT()
					}
					case "not_logged_in": {
						throw errors.COMMENT_LOGIN_REQUIRED()
					}
					case "comment_closed": {
						throw errors.COMMENT_CLOSED()
					}
					case "comment_id_not_found":
					case "comment_on_draft":
					case "comment_on_password_protected":
					case "comment_on_trash": {
						throw errors.COMMENT_ID_NOT_FOUND()
					}
					case "comment_author_column_length":
					case "comment_author_email_column_length":
					case "comment_author_url_column_length":
					case "comment_content_column_length": {
						throw errors.COMMENT_FIELD_TOO_LONG()
					}
					case "comment_duplicate": {
						throw errors.COMMENT_DUPLICATE()
					}
					case "comment_flood": {
						throw errors.COMMENT_RATE_LIMITED()
					}
					case "comment_reply_to_unapproved_comment": {
						throw errors.COMMENT_PARENT_UNAPPROVED()
					}
					case "rest_no_route": {
						throw errors.NOT_FOUND()
					}
					default:
						context.logger.error("Submit comment unhandled error", response.error, { code: response.error.code })
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			const comment = deserializeComment(response.data)
			if (!comment) {
				context.logger.error("Submitted comment resolved to no post", undefined, { commentId: response.data.id })
				throw errors.INTERNAL_SERVER_ERROR()
			}

			return comment
		},
	),
}
