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
	POST_SEARCH_REQUIRED: {
		status: 400,
		message: "A search term is required.",
	},
	POST_ORDERBY_INCLUDE_MISSING: {
		status: 400,
		message: "Ordering by 'include' requires the include parameter.",
	},
})
export type ListPostErrorMap = typeof LIST_POST_ERROR_MAP
