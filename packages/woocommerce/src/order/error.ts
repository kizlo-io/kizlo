import { defineErrorMap } from "kizlo"

export const GET_ORDER_ERROR_MAP = defineErrorMap({
	ORDER_NOT_FOUND: {
		status: 404,
		message: "Order not found.",
	},
	ORDER_FORBIDDEN: {
		status: 403,
		message: "You are not allowed to view this order.",
	},
})
export type GetOrderErrorMap = typeof GET_ORDER_ERROR_MAP
