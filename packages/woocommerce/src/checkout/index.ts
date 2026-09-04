import { createProcedure } from "kizlo"
import type { WCK_Cart } from "../cart/types"
import { deserializeCart } from "../cart/utils"
import { sessionMiddleware } from "../session"
import { CONFIRM_CHECKOUT_ERROR_MAP, GET_CHECKOUT_ERROR_MAP, RETRY_CHECKOUT_ERROR_MAP, UPDATE_CHECKOUT_ERROR_MAP } from "./error"
import { Checkout, ConfirmCheckoutInput, RetryCheckoutInput, UpdateCheckoutInput } from "./schema"
import { deserializeCheckout, gateway, serializeCheckoutBillingAddress, serializeCheckoutShippingAddress } from "./utils"

export const CHECKOUT_PROCEDURES = {
	get: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/checkout",
			output: Checkout,
			errors: GET_CHECKOUT_ERROR_MAP,
			middlewares: [sessionMiddleware({ transitionGuestCart: true })],
		},
		async ({ context, errors }) => {
			const response = await context.wordpress.woocommerce.store.checkout.get({}, { headers: context.sessionHeaders })
			if (response.error) {
				if (response.error.code === "woocommerce_rest_checkout_missing_order") {
					throw errors.CHECKOUT_ORDER_NOT_FOUND({ message: response.error.message })
				}

				context.logger.error("Get checkout unhandled error", response.error, { code: response.error.code })
				throw errors.INTERNAL_SERVER_ERROR()
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
			middlewares: [sessionMiddleware({ transitionGuestCart: true })],
		},
		async ({ context, input, errors }) => {
			const response = await context.wordpress.woocommerce.store.checkout.update(
				{
					order_notes: input.body.customerNote,
					payment_method: gateway(input.body.paymentMethod),
					additional_fields: input.body.additionalFields,
					extensions: input.body.extensions,
					__experimental_calc_totals: input.body.recalculateTotals,
				},
				{ headers: context.sessionHeaders },
			)
			if (response.error) {
				const conflict = conflictData(response.error.data)
				switch (response.error.code) {
					case "rest_invalid_param":
						throw errors.CHECKOUT_VALIDATION_FAILED({
							message: response.error.message,
							data: { fields: validationFields(response.error.data) },
						})
					case "woocommerce_rest_cart_coupon_error":
						throw errors.CHECKOUT_COUPON_INVALID({ message: response.error.message })
					case "woocommerce_rest_checkout_payment_method_disabled":
						throw errors.CHECKOUT_PAYMENT_METHOD_DISABLED({ message: response.error.message })
					case "woocommerce_rest_checkout_missing_order":
						throw errors.CHECKOUT_ORDER_NOT_FOUND({ message: response.error.message })
					case "woocommerce_rest_cart_empty":
						throw errors.CHECKOUT_CART_EMPTY({ message: response.error.message, data: conflict })
					case "woocommerce_rest_cart_item_error":
						throw errors.CHECKOUT_CART_INVALID({ message: response.error.message, data: conflict })
					case "woocommerce_rest_product_partially_out_of_stock":
						throw errors.CHECKOUT_PRODUCT_INSUFFICIENT_STOCK({ message: response.error.message, data: conflict })
					case "woocommerce_rest_product_not_purchasable":
						throw errors.CHECKOUT_PRODUCT_NOT_PURCHASABLE({ message: response.error.message, data: conflict })
					case "woocommerce_rest_product_out_of_stock":
						throw errors.CHECKOUT_PRODUCT_OUT_OF_STOCK({ message: response.error.message, data: conflict })
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
			middlewares: [sessionMiddleware({ transitionGuestCart: true })],
		},
		async ({ context, input, errors }) => {
			const response = await context.wordpress.woocommerce.store.checkout.process(
				{
					billing_address: serializeCheckoutBillingAddress(input.body.billingAddress),
					shipping_address: input.body.shippingAddress ? serializeCheckoutShippingAddress(input.body.shippingAddress) : undefined,
					payment_method: gateway(input.body.paymentMethod),
					customer_note: input.body.customerNote,
					create_account: input.body.createAccount ?? false,
					customer_password: input.body.customerPassword,
					payment_data: input.body.paymentData,
					additional_fields: input.body.additionalFields,
					extensions: input.body.extensions,
				},
				{ headers: context.sessionHeaders },
			)
			if (response.error) {
				const conflict = conflictData(response.error.data)
				switch (response.error.code) {
					case "rest_invalid_param":
						throw errors.CHECKOUT_VALIDATION_FAILED({
							message: response.error.message,
							data: { fields: validationFields(response.error.data) },
						})
					case "woocommerce_rest_invalid_address":
						throw errors.CHECKOUT_ADDRESS_INVALID({ message: response.error.message })
					case "woocommerce_rest_invalid_address_country":
						throw errors.CHECKOUT_ADDRESS_COUNTRY_INVALID({ message: response.error.message })
					case "woocommerce_rest_cart_coupon_error":
						throw errors.CHECKOUT_COUPON_INVALID({ message: response.error.message })
					case "woocommerce_rest_invalid_email_address":
						throw errors.CHECKOUT_EMAIL_INVALID({ message: response.error.message })
					case "woocommerce_rest_missing_email_address":
						throw errors.CHECKOUT_EMAIL_MISSING({ message: response.error.message })
					case "woocommerce_rest_checkout_process_payment_error":
						throw errors.CHECKOUT_PAYMENT_FAILED({ message: response.error.message })
					case "woocommerce_rest_checkout_payment_method_disabled":
						throw errors.CHECKOUT_PAYMENT_METHOD_DISABLED({ message: response.error.message })
					case "woocommerce_rest_checkout_missing_payment_method":
						throw errors.CHECKOUT_PAYMENT_METHOD_MISSING({ message: response.error.message })
					case "woocommerce_rest_checkout_custom_validation_error":
						throw errors.CHECKOUT_VALIDATION_FAILED({ message: response.error.message, data: { fields: {} } })
					case "woocommerce_rest_checkout_invalid_payment_result":
						throw errors.CHECKOUT_PAYMENT_RESULT_INVALID({ message: response.error.message })
					case "woocommerce_rest_guest_checkout_disabled":
						throw errors.CHECKOUT_GUEST_DISABLED({ message: response.error.message })
					case "woocommerce_rest_checkout_missing_order":
						if (response.status >= 500) throw errors.CHECKOUT_ORDER_CREATION_FAILED({ message: response.error.message })
						throw errors.CHECKOUT_ORDER_NOT_FOUND({ message: response.error.message })
					case "woocommerce_rest_cart_empty":
						throw errors.CHECKOUT_CART_EMPTY({ message: response.error.message, data: conflict })
					case "woocommerce_rest_cart_item_error":
						throw errors.CHECKOUT_CART_INVALID({ message: response.error.message, data: conflict })
					case "removed_coupons":
						throw errors.CHECKOUT_COUPONS_REMOVED({ message: response.error.message, data: conflict })
					case "woocommerce_rest_coupon_reserve_failed":
						throw errors.CHECKOUT_COUPON_RESERVATION_FAILED({ message: response.error.message, data: conflict })
					case "woocommerce_rest_product_partially_out_of_stock":
						throw errors.CHECKOUT_PRODUCT_INSUFFICIENT_STOCK({ message: response.error.message, data: conflict })
					case "woocommerce_rest_product_not_purchasable":
						throw errors.CHECKOUT_PRODUCT_NOT_PURCHASABLE({ message: response.error.message, data: conflict })
					case "woocommerce_rest_product_out_of_stock":
						throw errors.CHECKOUT_PRODUCT_OUT_OF_STOCK({ message: response.error.message, data: conflict })
					default:
						if (input.body.createAccount && response.status === 400) {
							throw errors.CHECKOUT_ACCOUNT_CREATION_FAILED({ message: response.error.message })
						}
						context.logger.error("Confirm checkout unhandled error", response.error, { code: response.error.code })
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			return deserializeCheckout(response.data)
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
			middlewares: [sessionMiddleware({ transitionGuestCart: true })],
		},
		async ({ context, input, errors }) => {
			const response = await context.wordpress.woocommerce.store.checkout.processOrder(
				{
					key: input.body.key,
					id: input.params.orderId,
					payment_data: input.body.paymentData,
					billing_email: input.body.billingEmail,
					payment_method: gateway(input.body.paymentMethod),
					billing_address: serializeCheckoutBillingAddress(input.body.billingAddress),
					shipping_address: input.body.shippingAddress ? serializeCheckoutShippingAddress(input.body.shippingAddress) : undefined,
					customer_note: input.body.customerNote,
					additional_fields: input.body.additionalFields,
					extensions: input.body.extensions,
				},
				{ headers: context.sessionHeaders },
			)
			if (response.error) {
				switch (response.error.code) {
					case "rest_invalid_param":
						throw errors.CHECKOUT_VALIDATION_FAILED({
							message: response.error.message,
							data: { fields: validationFields(response.error.data) },
						})
					case "woocommerce_rest_invalid_billing_email":
						throw errors.CHECKOUT_EMAIL_INVALID({ message: response.error.message })
					case "woocommerce_rest_checkout_process_payment_error":
						throw errors.CHECKOUT_PAYMENT_FAILED({ message: response.error.message })
					case "woocommerce_rest_checkout_payment_method_disabled":
						throw errors.CHECKOUT_PAYMENT_METHOD_DISABLED({ message: response.error.message })
					case "woocommerce_rest_checkout_missing_payment_method":
						throw errors.CHECKOUT_PAYMENT_METHOD_MISSING({ message: response.error.message })
					case "woocommerce_rest_checkout_invalid_payment_result":
						throw errors.CHECKOUT_PAYMENT_RESULT_INVALID({ message: response.error.message })
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

function validationFields(data: unknown): Record<string, string> {
	if (!isRecord(data)) return {}

	const fields: Record<string, string> = {}
	for (const source of [data.params, data.details]) {
		if (!isRecord(source)) continue

		for (const [name, value] of Object.entries(source)) {
			if (typeof value === "string") fields[name] = value
			else if (isRecord(value) && typeof value.message === "string") fields[name] = value.message
		}
	}

	return fields
}

function conflictData(data: unknown): { cart: ReturnType<typeof deserializeCart> | null } {
	if (!isRecord(data) || !isRecord(data.cart)) return { cart: null }

	try {
		return { cart: deserializeCart(data.cart as unknown as WCK_Cart) }
	} catch {
		return { cart: null }
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}
