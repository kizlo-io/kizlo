import { defineErrorMap } from "kizlo"
import z from "zod"
import { Cart } from "../cart/schema"

const CheckoutValidationData = z.object({ fields: z.record(z.string(), z.string()) })
const CheckoutConflictData = z.object({ cart: Cart.nullable() })

export const GET_CHECKOUT_ERROR_MAP = defineErrorMap({
	CHECKOUT_ORDER_NOT_FOUND: {
		status: 404,
		message: "No checkout order found.",
	},
})
export type GetCheckoutErrorMap = typeof GET_CHECKOUT_ERROR_MAP

export const CONFIRM_CHECKOUT_ERROR_MAP = defineErrorMap({
	CHECKOUT_ADDRESS_COUNTRY_INVALID: {
		status: 400,
		message: "The address country is not supported.",
	},
	CHECKOUT_ADDRESS_INVALID: {
		status: 400,
		message: "The provided address is invalid.",
	},
	CHECKOUT_COUPON_INVALID: {
		status: 400,
		message: "A coupon on the cart is no longer valid.",
	},
	CHECKOUT_EMAIL_INVALID: {
		status: 400,
		message: "The provided email address is invalid.",
	},
	CHECKOUT_EMAIL_MISSING: {
		status: 400,
		message: "An email address is required.",
	},
	CHECKOUT_PAYMENT_FAILED: {
		status: 400,
		message: "Payment could not be processed.",
	},
	CHECKOUT_PAYMENT_METHOD_DISABLED: {
		status: 400,
		message: "The selected payment method is not available.",
	},
	CHECKOUT_PAYMENT_METHOD_MISSING: {
		status: 400,
		message: "A payment method is required.",
	},
	CHECKOUT_VALIDATION_FAILED: {
		status: 400,
		message: "Checkout validation failed.",
		data: CheckoutValidationData,
	},
	CHECKOUT_ACCOUNT_CREATION_FAILED: {
		status: 400,
		message: "The customer account could not be created.",
	},
	CHECKOUT_PAYMENT_RESULT_INVALID: {
		status: 500,
		message: "The payment gateway returned an invalid result.",
	},
	CHECKOUT_ORDER_CREATION_FAILED: {
		status: 500,
		message: "The checkout order could not be created.",
	},
	CHECKOUT_GUEST_DISABLED: {
		status: 403,
		message: "Guest checkout is not allowed.",
	},
	CHECKOUT_ORDER_NOT_FOUND: {
		status: 404,
		message: "No checkout order found.",
	},
	CHECKOUT_CART_EMPTY: {
		status: 409,
		message: "The cart is empty.",
		data: CheckoutConflictData,
	},
	CHECKOUT_CART_INVALID: {
		status: 409,
		message: "An item in the cart is no longer valid.",
		data: CheckoutConflictData,
	},
	CHECKOUT_COUPONS_REMOVED: {
		status: 409,
		message: "One or more coupons were removed from the cart.",
		data: CheckoutConflictData,
	},
	CHECKOUT_COUPON_RESERVATION_FAILED: {
		status: 409,
		message: "A coupon could not be reserved for this order.",
		data: CheckoutConflictData,
	},
	CHECKOUT_PRODUCT_INSUFFICIENT_STOCK: {
		status: 409,
		message: "Not enough stock for one or more items in the cart.",
		data: CheckoutConflictData,
	},
	CHECKOUT_PRODUCT_NOT_PURCHASABLE: {
		status: 409,
		message: "An item in the cart is no longer purchasable.",
		data: CheckoutConflictData,
	},
	CHECKOUT_PRODUCT_OUT_OF_STOCK: {
		status: 409,
		message: "An item in the cart is out of stock.",
		data: CheckoutConflictData,
	},
})
export type ConfirmCheckoutErrorMap = typeof CONFIRM_CHECKOUT_ERROR_MAP

export const RETRY_CHECKOUT_ERROR_MAP = defineErrorMap({
	CHECKOUT_EMAIL_INVALID: {
		status: 400,
		message: "The billing email is invalid.",
	},
	CHECKOUT_PAYMENT_FAILED: {
		status: 400,
		message: "Payment could not be processed.",
	},
	CHECKOUT_PAYMENT_METHOD_DISABLED: {
		status: 400,
		message: "The selected payment method is not available.",
	},
	CHECKOUT_PAYMENT_METHOD_MISSING: {
		status: 400,
		message: "A payment method is required.",
	},
	CHECKOUT_VALIDATION_FAILED: {
		status: 400,
		message: "Checkout validation failed.",
		data: CheckoutValidationData,
	},
	CHECKOUT_PAYMENT_RESULT_INVALID: {
		status: 500,
		message: "The payment gateway returned an invalid result.",
	},
	CHECKOUT_ORDER_FORBIDDEN: {
		status: 403,
		message: "You are not allowed to pay for this order.",
	},
	CHECKOUT_ORDER_NOT_FOUND: {
		status: 404,
		message: "Order not found.",
	},
	CHECKOUT_ORDER_STATUS_INVALID: {
		status: 409,
		message: "This order is not in a state that can be paid.",
	},
})
export type RetryCheckoutErrorMap = typeof RETRY_CHECKOUT_ERROR_MAP

export const UPDATE_CHECKOUT_ERROR_MAP = defineErrorMap({
	CHECKOUT_COUPON_INVALID: {
		status: 400,
		message: "A coupon on the cart is no longer valid.",
	},
	CHECKOUT_PAYMENT_METHOD_DISABLED: {
		status: 400,
		message: "The selected payment method is not available.",
	},
	CHECKOUT_VALIDATION_FAILED: {
		status: 400,
		message: "Checkout validation failed.",
		data: CheckoutValidationData,
	},
	CHECKOUT_ORDER_NOT_FOUND: {
		status: 404,
		message: "No checkout order found.",
	},
	CHECKOUT_CART_EMPTY: {
		status: 409,
		message: "The cart is empty.",
		data: CheckoutConflictData,
	},
	CHECKOUT_CART_INVALID: {
		status: 409,
		message: "An item in the cart is no longer valid.",
		data: CheckoutConflictData,
	},
	CHECKOUT_PRODUCT_INSUFFICIENT_STOCK: {
		status: 409,
		message: "Not enough stock for one or more items in the cart.",
		data: CheckoutConflictData,
	},
	CHECKOUT_PRODUCT_NOT_PURCHASABLE: {
		status: 409,
		message: "An item in the cart is no longer purchasable.",
		data: CheckoutConflictData,
	},
	CHECKOUT_PRODUCT_OUT_OF_STOCK: {
		status: 409,
		message: "An item in the cart is out of stock.",
		data: CheckoutConflictData,
	},
})
export type UpdateCheckoutErrorMap = typeof UPDATE_CHECKOUT_ERROR_MAP
