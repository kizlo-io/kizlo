import { defineErrorMap } from "kizlo"

export const GET_ORDER_ERROR_MAP = defineErrorMap({
	ORDER_NOT_FOUND: {
		status: 404,
		message: "Order not found.",
	},
})
export type GetOrderErrorMap = typeof GET_ORDER_ERROR_MAP

export const LIST_ORDER_ERROR_MAP = defineErrorMap({})
export type ListOrderErrorMap = typeof LIST_ORDER_ERROR_MAP
