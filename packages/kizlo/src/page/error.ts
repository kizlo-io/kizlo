import { defineErrorMap } from "../shared/error"

export const GET_PAGE_ERROR_MAP = defineErrorMap({
	PAGE_NOT_FOUND: {
		status: 404,
		message: "Page not found",
	},
	PAGE_PASSWORD_INVALID: {
		status: 400,
		message: "Invalid page password.",
	},
})
export type GetPageErrorMap = typeof GET_PAGE_ERROR_MAP

export const LIST_PAGE_ERROR_MAP = defineErrorMap({
	PAGE_INVALID_PAGE: {
		status: 400,
		message: "The requested page does not exist.",
	},
})
export type ListPageErrorMap = typeof LIST_PAGE_ERROR_MAP
