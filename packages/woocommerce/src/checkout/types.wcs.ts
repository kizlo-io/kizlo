import type { LiteralUnion } from "@kizlo/shared"
import type { WCS_Cart } from "../cart/types.wcs"

// ==================================================
// SUPPORTING SCHEMAS
// ==================================================

export interface WCS_CheckoutBillingAddress {
	first_name: string
	last_name: string
	company: string
	address_1: string
	address_2: string
	city: string
	state: string
	postcode: string
	country: string
	email: string
	phone: string
}

export interface WCS_CheckoutShippingAddress {
	first_name: string
	last_name: string
	company: string
	address_1: string
	address_2: string
	city: string
	state: string
	postcode: string
	country: string
	phone: string
}

export interface WCS_CheckoutPaymentDetail {
	key: string
	value: string
}

export interface WCS_CheckoutPaymentResult {
	payment_status: "success" | "failure" | "pending" | "error" | ""
	payment_details: WCS_CheckoutPaymentDetail[]
	redirect_url: string
}

// ==================================================
// CHECKOUT (response schema)
// ==================================================

export interface WCS_Checkout {
	order_id: number
	status: LiteralUnion<"checkout-draft" | "pending" | "on-hold" | "processing" | "completed" | "cancelled" | "failed" | "refunded", string>
	order_key: string
	order_number: string
	customer_note: string
	customer_id: number
	billing_address: WCS_CheckoutBillingAddress
	shipping_address: WCS_CheckoutShippingAddress
	payment_method: string
	payment_result: WCS_CheckoutPaymentResult | null
	additional_fields: Record<string, string | boolean>
	__experimentalCart: WCS_Cart | null
	extensions: Record<string, unknown>
}

// ==================================================
// GET /checkout
// ==================================================

export interface WCS_CheckoutGetInput {}

export type WCS_CheckoutGetErrorCode =
	| "woocommerce_rest_checkout_missing_order"
	| "woocommerce_rest_cart_error"
	| "woocommerce_rest_invalid_nonce"
	| "woocommerce_rest_missing_nonce"
	| "woocommerce_rest_unknown_server_error"

// ==================================================
// PUT /checkout
// ==================================================

export interface WCS_CheckoutUpdateInput {
	/** Recalculate totals and run cart validation before responding. Query param. */
	__experimental_calc_totals?: boolean
	/** Name => value pairs of additional fields to update. */
	additional_fields?: Record<string, string | boolean>
	/** The ID of the payment method selected. */
	payment_method?: string
	/** Order notes. */
	order_notes?: string
}

// PUT /checkout's validate_callback returns rest_invalid_param wrapping per-field
// codes (e.g. woocommerce_required_checkout_field) inside `data.details`, so those
// per-field codes do not appear as top-level error.code. The cart-validation codes
// only fire when __experimental_calc_totals=true.
export type WCS_CheckoutUpdateErrorCode =
	| "rest_invalid_param"
	| "woocommerce_rest_cart_empty"
	| "woocommerce_rest_cart_item_error"
	| "woocommerce_rest_cart_coupon_error"
	| "woocommerce_rest_checkout_payment_method_disabled"
	| "woocommerce_rest_product_not_purchasable"
	| "woocommerce_rest_product_out_of_stock"
	| "woocommerce_rest_product_partially_out_of_stock"
	| "woocommerce_rest_checkout_missing_order"
	| "woocommerce_rest_cart_error"
	| "woocommerce_rest_invalid_nonce"
	| "woocommerce_rest_missing_nonce"
	| "woocommerce_rest_unknown_server_error"

// ==================================================
// POST /checkout
// ==================================================

export interface WCS_CheckoutProcessPaymentData {
	key: string
	value: string | boolean
}

export interface WCS_CheckoutProcessBillingAddressInput {
	first_name?: string
	last_name?: string
	company?: string
	address_1?: string
	address_2?: string
	city?: string
	state?: string
	postcode?: string
	country?: string
	email?: string
	phone?: string
}

export interface WCS_CheckoutProcessShippingAddressInput {
	first_name?: string
	last_name?: string
	company?: string
	address_1?: string
	address_2?: string
	city?: string
	state?: string
	postcode?: string
	country?: string
	phone?: string
}

export interface WCS_CheckoutProcessInput {
	/** Object of updated billing address data for the customer. */
	billing_address: WCS_CheckoutProcessBillingAddressInput
	/** Object of updated shipping address data for the customer. */
	shipping_address: WCS_CheckoutProcessShippingAddressInput
	/** Note added to the order by the customer during checkout. */
	customer_note?: string
	/** The ID of the payment method being used to process payment. */
	payment_method: string
	/** Data to pass through to the payment method when processing. */
	payment_data?: WCS_CheckoutProcessPaymentData[]
	/** Optionally define a password for new accounts. */
	customer_password?: string
	/** Whether to create a new user account as part of order processing. */
	create_account?: boolean
	/** Name => value pairs of additional fields to persist on the order. */
	additional_fields?: Record<string, string | boolean>
}

// process_payment catches every payment-gateway exception and re-throws as
// woocommerce_rest_checkout_process_payment_error (400), so gateway-specific
// codes do not surface as top-level error.code. process_customer wraps a
// wc_create_new_customer WP_Error with that error's own dynamic code (e.g.
// registration-related), so the real surface is wider than this enum.
export type WCS_CheckoutProcessErrorCode =
	| "rest_invalid_param"
	| "removed_coupons"
	| "woocommerce_rest_cart_empty"
	| "woocommerce_rest_cart_item_error"
	| "woocommerce_rest_cart_coupon_error"
	| "woocommerce_rest_checkout_custom_validation_error"
	| "woocommerce_rest_checkout_missing_payment_method"
	| "woocommerce_rest_checkout_payment_method_disabled"
	| "woocommerce_rest_checkout_process_payment_error"
	| "woocommerce_rest_coupon_reserve_failed"
	| "woocommerce_rest_guest_checkout_disabled"
	| "woocommerce_rest_invalid_address"
	| "woocommerce_rest_invalid_address_country"
	| "woocommerce_rest_invalid_email_address"
	| "woocommerce_rest_missing_email_address"
	| "woocommerce_rest_product_not_purchasable"
	| "woocommerce_rest_product_out_of_stock"
	| "woocommerce_rest_product_partially_out_of_stock"
	| "woocommerce_rest_checkout_invalid_payment_result"
	| "woocommerce_rest_checkout_missing_order"
	| "woocommerce_rest_cart_error"
	| "woocommerce_rest_invalid_nonce"
	| "woocommerce_rest_missing_nonce"
	| "woocommerce_rest_unknown_server_error"

// ==================================================
// POST /checkout/<id>
// ==================================================

export interface WCS_CheckoutOrderProcessInput {
	/** The order ID being paid. Path parameter. */
	id: number
	/** The key for the order verification. */
	key: string
	/** The email address used to verify guest orders. */
	billing_email?: string
	/** Object of updated billing address data for the customer. */
	billing_address: WCS_CheckoutProcessBillingAddressInput
	/** Object of updated shipping address data for the customer. */
	shipping_address: WCS_CheckoutProcessShippingAddressInput
	/** The ID of the payment method being used to process the payment. */
	payment_method: string
	/** Data to pass through to the payment method when processing payment. */
	payment_data?: WCS_CheckoutProcessPaymentData[]
}

// Same payment-gateway folding caveat as WCS_CheckoutProcessErrorCode.
export type WCS_CheckoutOrderProcessErrorCode =
	| "invalid_order_update_status"
	| "woocommerce_rest_checkout_invalid_payment_result"
	| "woocommerce_rest_checkout_missing_payment_method"
	| "woocommerce_rest_checkout_payment_method_disabled"
	| "woocommerce_rest_checkout_process_payment_error"
	| "woocommerce_rest_invalid_billing_email"
	| "woocommerce_rest_invalid_order"
	| "woocommerce_rest_invalid_user"
	| "woocommerce_rest_cart_error"
	| "woocommerce_rest_invalid_nonce"
	| "woocommerce_rest_missing_nonce"
	| "woocommerce_rest_unknown_server_error"
