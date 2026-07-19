import { defineErrorMap } from "../shared/error"

export const GET_TAG_ERROR_MAP = defineErrorMap({
	TAG_NOT_FOUND: {
		status: 404,
		message: "Tag not found",
	},
})
export type GetTagErrorMap = typeof GET_TAG_ERROR_MAP

export const LIST_TAG_ERROR_MAP = defineErrorMap({
	TAG_INVALID_PAGE: {
		status: 400,
		message: "The requested page does not exist.",
	},
})
export type ListTagErrorMap = typeof LIST_TAG_ERROR_MAP
