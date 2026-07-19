import { defineErrorMap } from "../shared/error"

export const GET_POST_ERROR_MAP = defineErrorMap({
	POST_NOT_FOUND: {
		status: 404,
		message: "Post not found",
	},
	POST_PASSWORD_INVALID: {
		status: 400,
		message: "Invalid post password.",
	},
})
export type GetPostErrorMap = typeof GET_POST_ERROR_MAP

export const LIST_POST_ERROR_MAP = defineErrorMap({
	POST_INVALID_PAGE: {
		status: 400,
		message: "The requested page does not exist.",
	},
})
export type ListPostErrorMap = typeof LIST_POST_ERROR_MAP
