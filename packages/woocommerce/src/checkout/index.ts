import { createProcedure, WC_STORE_BASE } from "kizlo"
import { sessionMiddleware } from "../session"
import { CONFIRM_CHECKOUT_ERROR_MAP, GET_CHECKOUT_ERROR_MAP, RETRY_CHECKOUT_ERROR_MAP, UPDATE_CHECKOUT_ERROR_MAP } from "./error"
import { Checkout, ConfirmCheckoutInput, RetryCheckoutInput, UpdateCheckoutInput } from "./schema"
import type {
	WCS_Checkout,
	WCS_CheckoutGetErrorCode,
	WCS_CheckoutOrderProcessErrorCode,
	WCS_CheckoutOrderProcessInput,
	WCS_CheckoutProcessErrorCode,
	WCS_CheckoutProcessInput,
	WCS_CheckoutUpdateErrorCode,
	WCS_CheckoutUpdateInput,
} from "./types.wcs"
import { deserializeCheckout } from "./utils"

export const CHECKOUT_ROUTER = {
	get: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/checkout",
			output: Checkout,
			errors: GET_CHECKOUT_ERROR_MAP,
			middlewares: [sessionMiddleware()],
		},
		async ({ context, errors }) => {
			const response = await context.wordpress.get<WCS_Checkout, WCS_CheckoutGetErrorCode>("/checkout", {
				base: WC_STORE_BASE,
				headers: context.sessionHeaders,
			})
			if (response.error) {
				switch (response.error.code) {
					case "woocommerce_rest_checkout_missing_order":
						throw errors.CHECKOUT_ORDER_NOT_FOUND({ message: response.error.message })
					default:
						context.logger.error("Get checkout unhandled error", response.error, { code: response.error.code })
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			return deserializeCheckout(response.data)
		},
	),

	update: createProcedure(
		{
			scope: "api",
			method: "PUT",
			path: "/checkout",
			body: UpdateCheckoutInput,
			output: Checkout,
			errors: UPDATE_CHECKOUT_ERROR_MAP,
			middlewares: [sessionMiddleware()],
		},
		async ({ context, input, errors }) => {
			const response = await context.wordpress.put<WCS_Checkout, WCS_CheckoutUpdateErrorCode>("/checkout", {
				base: WC_STORE_BASE,
				body: {
					order_notes: input.body.customerNote,
					payment_method: input.body.paymentMethod,
					additional_fields: input.body.additionalFields,
					__experimental_calc_totals: input.body.recalculateTotals,
				} satisfies WCS_CheckoutUpdateInput,
				headers: context.sessionHeaders,
			})
			if (response.error) {
				switch (response.error.code) {
					case "woocommerce_rest_cart_coupon_error":
						throw errors.CHECKOUT_COUPON_INVALID({ message: response.error.message })
					case "woocommerce_rest_checkout_payment_method_disabled":
						throw errors.CHECKOUT_PAYMENT_METHOD_DISABLED({ message: response.error.message })
					case "woocommerce_rest_checkout_missing_order":
						throw errors.CHECKOUT_ORDER_NOT_FOUND({ message: response.error.message })
					case "woocommerce_rest_cart_empty":
						throw errors.CHECKOUT_CART_EMPTY({ message: response.error.message })
					case "woocommerce_rest_cart_item_error":
						throw errors.CHECKOUT_CART_INVALID({ message: response.error.message })
					case "woocommerce_rest_product_partially_out_of_stock":
						throw errors.CHECKOUT_PRODUCT_INSUFFICIENT_STOCK({ message: response.error.message })
					case "woocommerce_rest_product_not_purchasable":
						throw errors.CHECKOUT_PRODUCT_NOT_PURCHASABLE({ message: response.error.message })
					case "woocommerce_rest_product_out_of_stock":
						throw errors.CHECKOUT_PRODUCT_OUT_OF_STOCK({ message: response.error.message })
					default:
						context.logger.error("Update checkout unhandled error", response.error, { code: response.error.code })
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			return deserializeCheckout(response.data)
		},
	),

	confirm: createProcedure(
		{
			scope: "api",
			method: "POST",
			path: "/checkout",
			body: ConfirmCheckoutInput,
			output: Checkout,
			errors: CONFIRM_CHECKOUT_ERROR_MAP,
			middlewares: [sessionMiddleware()],
		},
		async ({ context, input, errors }) => {
			const checkoutResponse = await context.wordpress.get<WCS_Checkout, WCS_CheckoutGetErrorCode>("/checkout", {
				base: WC_STORE_BASE,
				headers: context.sessionHeaders,
			})
			if (checkoutResponse.error) {
				switch (checkoutResponse.error.code) {
					case "woocommerce_rest_checkout_missing_order":
						throw errors.CHECKOUT_ORDER_NOT_FOUND({ message: checkoutResponse.error.message })
					default:
						context.logger.error("Get checkout for confirm unhandled error", checkoutResponse.error, {
							code: checkoutResponse.error.code,
						})
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			const confirmResponse = await context.wordpress.post<WCS_Checkout, WCS_CheckoutProcessErrorCode>("/checkout", {
				base: WC_STORE_BASE,
				body: {
					payment_data: input.body.paymentData,
					customer_password: input.body.customerPassword,
					customer_note: checkoutResponse.data.customer_note,
					payment_method: checkoutResponse.data.payment_method,
					create_account: !!input.body.customerPassword?.length,
					billing_address: checkoutResponse.data.billing_address,
					shipping_address: checkoutResponse.data.shipping_address,
					additional_fields: checkoutResponse.data.additional_fields,
				} satisfies WCS_CheckoutProcessInput,
				headers: context.sessionHeaders,
			})
			if (confirmResponse.error) {
				switch (confirmResponse.error.code) {
					case "woocommerce_rest_invalid_address":
						throw errors.CHECKOUT_ADDRESS_INVALID({ message: confirmResponse.error.message })
					case "woocommerce_rest_invalid_address_country":
						throw errors.CHECKOUT_ADDRESS_COUNTRY_INVALID({ message: confirmResponse.error.message })
					case "woocommerce_rest_cart_coupon_error":
						throw errors.CHECKOUT_COUPON_INVALID({ message: confirmResponse.error.message })
					case "woocommerce_rest_invalid_email_address":
						throw errors.CHECKOUT_EMAIL_INVALID({ message: confirmResponse.error.message })
					case "woocommerce_rest_missing_email_address":
						throw errors.CHECKOUT_EMAIL_MISSING({ message: confirmResponse.error.message })
					case "woocommerce_rest_checkout_process_payment_error":
						throw errors.CHECKOUT_PAYMENT_FAILED({ message: confirmResponse.error.message })
					case "woocommerce_rest_checkout_payment_method_disabled":
						throw errors.CHECKOUT_PAYMENT_METHOD_DISABLED({ message: confirmResponse.error.message })
					case "woocommerce_rest_checkout_missing_payment_method":
						throw errors.CHECKOUT_PAYMENT_METHOD_MISSING({ message: confirmResponse.error.message })
					case "woocommerce_rest_checkout_custom_validation_error":
						throw errors.CHECKOUT_VALIDATION_FAILED({ message: confirmResponse.error.message })
					case "woocommerce_rest_guest_checkout_disabled":
						throw errors.CHECKOUT_GUEST_DISABLED({ message: confirmResponse.error.message })
					case "woocommerce_rest_checkout_missing_order":
						throw errors.CHECKOUT_ORDER_NOT_FOUND({ message: confirmResponse.error.message })
					case "woocommerce_rest_cart_empty":
						throw errors.CHECKOUT_CART_EMPTY({ message: confirmResponse.error.message })
					case "woocommerce_rest_cart_item_error":
						throw errors.CHECKOUT_CART_INVALID({ message: confirmResponse.error.message })
					case "removed_coupons":
						throw errors.CHECKOUT_COUPONS_REMOVED({ message: confirmResponse.error.message })
					case "woocommerce_rest_coupon_reserve_failed":
						throw errors.CHECKOUT_COUPON_RESERVATION_FAILED({ message: confirmResponse.error.message })
					case "woocommerce_rest_product_partially_out_of_stock":
						throw errors.CHECKOUT_PRODUCT_INSUFFICIENT_STOCK({ message: confirmResponse.error.message })
					case "woocommerce_rest_product_not_purchasable":
						throw errors.CHECKOUT_PRODUCT_NOT_PURCHASABLE({ message: confirmResponse.error.message })
					case "woocommerce_rest_product_out_of_stock":
						throw errors.CHECKOUT_PRODUCT_OUT_OF_STOCK({ message: confirmResponse.error.message })
					default:
						context.logger.error("Confirm checkout unhandled error", confirmResponse.error, { code: confirmResponse.error.code })
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			return deserializeCheckout(confirmResponse.data)
		},
	),

	retry: createProcedure(
		{
			scope: "api",
			method: "POST",
			path: "/checkout/{orderId}",
			params: RetryCheckoutInput.pick({ orderId: true }),
			body: RetryCheckoutInput.omit({ orderId: true }),
			output: Checkout,
			errors: RETRY_CHECKOUT_ERROR_MAP,
			middlewares: [sessionMiddleware()],
		},
		async ({ context, input, errors }) => {
			const response = await context.wordpress.post<WCS_Checkout, WCS_CheckoutOrderProcessErrorCode>(`/checkout/${input.params.orderId}`, {
				base: WC_STORE_BASE,
				body: {
					key: input.body.key,
					id: input.params.orderId,
					payment_data: input.body.paymentData,
					billing_email: input.body.billingEmail,
					payment_method: input.body.paymentMethod,
					billing_address: input.body.billingAddress ?? {},
					shipping_address: input.body.shippingAddress ?? {},
				} satisfies WCS_CheckoutOrderProcessInput,
				headers: context.sessionHeaders,
			})
			if (response.error) {
				switch (response.error.code) {
					case "woocommerce_rest_invalid_billing_email":
						throw errors.CHECKOUT_EMAIL_INVALID({ message: response.error.message })
					case "woocommerce_rest_checkout_process_payment_error":
						throw errors.CHECKOUT_PAYMENT_FAILED({ message: response.error.message })
					case "woocommerce_rest_checkout_payment_method_disabled":
						throw errors.CHECKOUT_PAYMENT_METHOD_DISABLED({ message: response.error.message })
					case "woocommerce_rest_checkout_missing_payment_method":
						throw errors.CHECKOUT_PAYMENT_METHOD_MISSING({ message: response.error.message })
					case "woocommerce_rest_invalid_user":
						throw errors.CHECKOUT_ORDER_FORBIDDEN({ message: response.error.message })
					case "woocommerce_rest_invalid_order":
						throw errors.CHECKOUT_ORDER_NOT_FOUND({ message: response.error.message })
					case "invalid_order_update_status":
						throw errors.CHECKOUT_ORDER_STATUS_INVALID({ message: response.error.message })
					default:
						context.logger.error("Retry checkout unhandled error", response.error, {
							orderId: input.params.orderId,
							code: response.error.code,
						})
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			return deserializeCheckout(response.data)
		},
	),
}
