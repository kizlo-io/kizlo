import { defineErrorMap } from "../shared/error"

export const GET_USER_ERROR_MAP = defineErrorMap({
	USER_NOT_FOUND: {
		status: 404,
		message: "User not found.",
	},
})
export type GetUserErrorMap = typeof GET_USER_ERROR_MAP
