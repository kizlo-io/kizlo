import { defineErrorMap } from "kizlo"

export const GET_PRODUCT_ERROR_MAP = defineErrorMap({
	PRODUCT_NOT_FOUND: {
		status: 404,
		message: "Product not found.",
	},
})
export type GetProductErrorMap = typeof GET_PRODUCT_ERROR_MAP

export const LIST_PRODUCT_ERROR_MAP = defineErrorMap({})
export type ListProductErrorMap = typeof LIST_PRODUCT_ERROR_MAP

export const FILTER_PRODUCT_ERROR_MAP = defineErrorMap({})
export type FilterProductsErrorMap = typeof FILTER_PRODUCT_ERROR_MAP
