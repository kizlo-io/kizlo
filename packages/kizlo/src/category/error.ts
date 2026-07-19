import { defineErrorMap } from "../shared/error"

export const GET_CATEGORY_ERROR_MAP = defineErrorMap({
	CATEGORY_NOT_FOUND: {
		status: 404,
		message: "Category not found",
	},
})
export type GetCategoryErrorMap = typeof GET_CATEGORY_ERROR_MAP

export const LIST_CATEGORY_ERROR_MAP = defineErrorMap({
	CATEGORY_INVALID_PAGE: {
		status: 400,
		message: "The requested page does not exist.",
	},
})
export type ListCategoryErrorMap = typeof LIST_CATEGORY_ERROR_MAP
