import type { WP_EndpointInput } from "kizlo"
import type { CartBillingAddress, CartShippingAddress } from "../cart/schema"
import type { WCK_Cart } from "../cart/types"
import {
	deserializeCart,
	deserializeCartBillingAddress,
	deserializeCartShippingAddress,
	serializeCartBillingAddress,
	serializeCartShippingAddress,
} from "../cart/utils"
import { deserializeExtensions } from "../product/utils"
import type { Checkout, CheckoutAdditionalFields } from "./schema"
import type { WCK_Checkout, WCK_CheckoutOrder } from "./types"

type Gateway = NonNullable<WP_EndpointInput<"woocommerce.store.checkout.update">["payment_method"]>

const CHECKOUT_KEYS = [
	"__experimentalCart",
	"additional_fields",
	"billing_address",
	"customer_id",
	"customer_note",
	"extensions",
	"order_id",
	"order_key",
	"order_number",
	"payment_method",
	"payment_result",
	"shipping_address",
	"status",
] as const satisfies readonly (keyof WCK_Checkout)[]

const CHECKOUT_ORDER_KEYS = CHECKOUT_KEYS satisfies readonly (keyof WCK_CheckoutOrder)[]
const _BILLING_ADDRESS_KEYS = [
	"address_1",
	"address_2",
	"city",
	"company",
	"country",
	"email",
	"first_name",
	"last_name",
	"phone",
	"postcode",
	"state",
] as const satisfies readonly (keyof WCK_Checkout["billing_address"])[]
const _SHIPPING_ADDRESS_KEYS = [
	"address_1",
	"address_2",
	"city",
	"company",
	"country",
	"first_name",
	"last_name",
	"phone",
	"postcode",
	"state",
] as const satisfies readonly (keyof WCK_Checkout["shipping_address"])[]
const PAYMENT_RESULT_KEYS = ["payment_details", "payment_status", "redirect_url"] as const satisfies readonly (keyof NonNullable<
	WCK_Checkout["payment_result"]
>)[]
const PAYMENT_DETAIL_KEYS = ["key", "value"] as const satisfies readonly (keyof NonNullable<
	WCK_Checkout["payment_result"]
>["payment_details"][number])[]

function assertNoMissing<_T extends never>(): void {}
assertNoMissing<Exclude<keyof WCK_Checkout, (typeof CHECKOUT_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCK_CheckoutOrder, (typeof CHECKOUT_ORDER_KEYS)[number]>>()
assertNoMissing<Exclude<keyof NonNullable<WCK_Checkout["payment_result"]>, (typeof PAYMENT_RESULT_KEYS)[number]>>()
assertNoMissing<
	Exclude<keyof NonNullable<WCK_Checkout["payment_result"]>["payment_details"][number], (typeof PAYMENT_DETAIL_KEYS)[number]>
>()

/**
 * WooCommerce builds this enum from the gateways enabled on the WordPress used for generation.
 * The target store performs the authoritative validation, so callers may send any gateway ID.
 */
export function gateway(method: string): Gateway
export function gateway(method: undefined): undefined
export function gateway(method: string | undefined): Gateway | undefined
export function gateway(method: string | undefined): Gateway | undefined {
	return method as Gateway | undefined
}

export function deserializeCheckout(data: WCK_Checkout | WCK_CheckoutOrder): Checkout {
	const { extensions } = deserializeExtensions(data.extensions)
	const paymentResult = data.payment_result

	return {
		orderId: data.order_id === 0 ? null : data.order_id,
		orderNumber: data.order_number === "" || data.order_number === "0" ? null : data.order_number,
		orderKey: data.order_key === "" ? null : data.order_key,
		status: data.status,
		customerId: data.customer_id === 0 ? null : data.customer_id,
		customerNote: data.customer_note,
		billingAddress: deserializeCartBillingAddress(data.billing_address as WCK_Cart["billing_address"]),
		shippingAddress: deserializeCartShippingAddress(data.shipping_address as WCK_Cart["shipping_address"]),
		paymentMethod: data.payment_method === "" ? null : data.payment_method,
		paymentResult:
			paymentResult?.payment_status === undefined || paymentResult.payment_status === ""
				? null
				: {
						status: paymentResult.payment_status,
						details: paymentResult.payment_details,
						redirectUrl: paymentResult.redirect_url === "" ? null : paymentResult.redirect_url,
					},
		additionalFields: checkoutAdditionalFields(data.additional_fields),
		cart: data.__experimentalCart ? deserializeCart(data.__experimentalCart) : null,
		extensions,
	}
}

export function serializeCheckoutShippingAddress(address: CartShippingAddress) {
	return serializeCartShippingAddress(address)
}

export function serializeCheckoutBillingAddress(address: CartBillingAddress) {
	return serializeCartBillingAddress(address)
}

function checkoutAdditionalFields(fields: Record<string, unknown> | undefined): CheckoutAdditionalFields {
	return Object.fromEntries(
		Object.entries(fields ?? {}).filter(
			(entry): entry is [string, string | boolean] => typeof entry[1] === "string" || typeof entry[1] === "boolean",
		),
	)
}
