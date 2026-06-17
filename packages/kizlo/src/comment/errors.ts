import { defineErrorMap } from "../shared/error"

export const GET_COMMENT_ERROR_MAP = defineErrorMap({
	COMMENT_NOT_FOUND: {
		status: 404,
		message: "Comment not found.",
	},
	COMMENT_FORBIDDEN: {
		status: 403,
		message: "You are not allowed to read this comment.",
	},
})
export type GetCommentErrorMap = typeof GET_COMMENT_ERROR_MAP

export const LIST_COMMENT_ERROR_MAP = defineErrorMap({
	COMMENT_FORBIDDEN: {
		status: 403,
		message: "You are not allowed to read comments.",
	},
	COMMENT_POST_TYPE_NOT_SUPPORTED: {
		status: 400,
		message: "The post type does not support comments.",
	},
})
export type ListCommentErrorMap = typeof LIST_COMMENT_ERROR_MAP

export const SUBMIT_COMMENT_ERROR_MAP = defineErrorMap({
	COMMENT_USER_NOT_FOUND: {},
	COMMENT_ID_NOT_FOUND: {},
	COMMENT_CLOSED: {},
	COMMENT_LOGIN_REQUIRED: {},
	COMMENT_NAME_EMAIL_REQUIRED: {},
	COMMENT_INVALID_EMAIL: {},
	COMMENT_EMPTY_CONTENT: {},
	COMMENT_FIELD_TOO_LONG: {},
	COMMENT_DUPLICATE: {},
	COMMENT_RATE_LIMITED: {},
	COMMENT_PARENT_UNAPPROVED: {},
	COMMENT_CAPTCHA_REQUIRED: {
		status: 400,
		message: "Comment captcha is required.",
	},
	COMMENT_CAPTCHA_INVALID: {
		status: 400,
		message: "Comment captcha is invalid.",
	},
})
export type SubmitCommentErrorMap = typeof SUBMIT_COMMENT_ERROR_MAP
