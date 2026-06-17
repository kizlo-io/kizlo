import { defineErrorMap } from "kizlo"

export const GET_CART_ERROR_MAP = defineErrorMap({})
export type GetCartErrorMap = typeof GET_CART_ERROR_MAP

export const UPDATE_CART_ERROR_MAP = defineErrorMap({})
export type UpdateCartErrorMap = typeof UPDATE_CART_ERROR_MAP

export const ADD_CART_ITEM_ERROR_MAP = defineErrorMap({
	CART_ITEM_OUT_OF_STOCK: {
		status: 409,
		message: "Product is out of stock.",
	},
	CART_ITEM_INSUFFICIENT_STOCK: {
		status: 409,
		message: "Not enough stock for the requested quantity.",
	},
	CART_ITEM_NOT_PURCHASABLE: {
		status: 400,
		message: "Product is not purchasable.",
	},
	CART_ITEM_INVALID_QUANTITY: {
		status: 400,
		message: "Invalid quantity for the cart item.",
	},
	CART_ITEM_EXISTS: {
		status: 409,
		message: "Item already exists in the cart.",
	},
	CART_PRODUCT_INVALID: {
		status: 404,
		message: "The requested product is invalid.",
	},
	CART_VARIATION_INVALID: {
		status: 400,
		message: "Variation data is invalid or missing.",
	},
})
export type AddCartItemErrorMap = typeof ADD_CART_ITEM_ERROR_MAP

export const UPDATE_CART_ITEM_ERROR_MAP = defineErrorMap({
	CART_ITEM_NOT_FOUND: {
		status: 404,
		message: "Cart item not found.",
	},
	CART_PRODUCT_INVALID: {
		status: 404,
		message: "The requested product is invalid.",
	},
	CART_ITEM_OUT_OF_STOCK: {
		status: 409,
		message: "Product is out of stock.",
	},
	CART_ITEM_INSUFFICIENT_STOCK: {
		status: 409,
		message: "Not enough stock for the requested quantity.",
	},
	CART_ITEM_INVALID_QUANTITY: {
		status: 400,
		message: "Invalid quantity for the cart item.",
	},
})
export type UpdateCartItemErrorMap = typeof UPDATE_CART_ITEM_ERROR_MAP

export const REMOVE_CART_ITEM_ERROR_MAP = defineErrorMap({
	CART_ITEM_NOT_FOUND: {
		status: 404,
		message: "Cart item not found.",
	},
})
export type RemoveCartItemErrorMap = typeof REMOVE_CART_ITEM_ERROR_MAP

export const SELECT_SHIPPING_RATE_ERROR_MAP = defineErrorMap({
	CART_SHIPPING_RATE_NOT_FOUND: {
		status: 404,
		message: "The selected shipping rate is no longer available.",
	},
	CART_SHIPPING_DISABLED: {
		status: 400,
		message: "Shipping is not available for this cart.",
	},
})
export type SelectShippingRateErrorMap = typeof SELECT_SHIPPING_RATE_ERROR_MAP

export const APPLY_COUPON_ERROR_MAP = defineErrorMap({
	CART_COUPON_INVALID: {
		status: 400,
		message: "The coupon could not be applied to the cart.",
	},
	CART_COUPON_DISABLED: {
		status: 400,
		message: "Coupons are disabled.",
	},
})
export type ApplyCouponErrorMap = typeof APPLY_COUPON_ERROR_MAP

export const REMOVE_COUPON_ERROR_MAP = defineErrorMap({
	CART_COUPON_INVALID: {
		status: 400,
		message: "The coupon could not be removed from the cart.",
	},
	CART_COUPON_DISABLED: {
		status: 400,
		message: "Coupons are disabled.",
	},
	CART_COUPON_NOT_FOUND: {
		status: 404,
		message: "Coupon was not applied to the cart.",
	},
})
export type RemoveCouponErrorMap = typeof REMOVE_COUPON_ERROR_MAP
