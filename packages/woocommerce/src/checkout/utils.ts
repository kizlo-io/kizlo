import type { WP_EndpointInput } from "kizlo"
import { deserializeCart } from "../cart/utils"
import type { BillingAddress, ShippingAddress } from "../schema"
import type { Checkout } from "./schema"
import type { WCK_Checkout, WCK_CheckoutOrder } from "./types"

/** The payment gateway IDs the generated contract enumerates, which is one install's list. */
type Gateway = NonNullable<WP_EndpointInput<"woocommerce.store.checkout.update">["payment_method"]>

/**
 * A payment method the caller named, passed to WooCommerce as one.
 *
 * WooCommerce builds this argument's enum from `get_payment_gateway_ids()`, so the contract
 * enumerates the gateways enabled on the WordPress the client was generated against. That is true of
 * that install and says nothing about the one a build actually talks to, and WooCommerce agrees: its
 * own comment on the enum is that further validation happens during the request.
 *
 * So the enum is documentation here rather than a constraint, and the gateway a shopper chose is
 * sent whatever it is. WooCommerce rejects an unknown one with
 * `woocommerce_rest_checkout_payment_method_disabled`, which both callers already map.
 */
export function gateway(method: string | undefined): Gateway | undefined {
	return method as Gateway | undefined
}

/**
 * A Kizlo address in the shape WooCommerce registered its argument in.
 *
 * Kizlo's addresses are camelCase and WooCommerce's are snake_case, and until the contract described
 * the route nothing said so: the retry call passed a Kizlo address straight through as
 * `billing_address`, where every key missed and WooCommerce kept the address already on the order.
 *
 * Every field is required there, so an address given in part is sent filled out.
 */
export function serializeAddress(address: ShippingAddress | BillingAddress | undefined) {
	return {
		first_name: address?.firstName ?? "",
		last_name: address?.lastName ?? "",
		address_1: address?.address1 ?? "",
		address_2: address?.address2 ?? "",
		company: address?.company ?? "",
		city: address?.city ?? "",
		state: address?.state ?? "",
		country: address?.country ?? "",
		postcode: address?.postcode ?? "",
		phone: address?.phone ?? "",
	}
}

export function deserializeCheckout(data: WCK_Checkout | WCK_CheckoutOrder): Checkout {
	return {
		cart: data.__experimentalCart ? deserializeCart(data.__experimentalCart) : null,
		shippingAddress: {
			address1: data.shipping_address.address_1,
			address2: data.shipping_address.address_2,
			city: data.shipping_address.city,
			company: data.shipping_address.company,
			country: data.shipping_address.country,
			firstName: data.shipping_address.first_name,
			lastName: data.shipping_address.last_name,
			phone: data.shipping_address.phone,
			postcode: data.shipping_address.postcode,
			state: data.shipping_address.state,
		},
		billingAddress: {
			address1: data.billing_address.address_1,
			address2: data.billing_address.address_2,
			city: data.billing_address.city,
			company: data.billing_address.company,
			country: data.billing_address.country,
			email: data.billing_address.email,
			firstName: data.billing_address.first_name,
			lastName: data.billing_address.last_name,
			phone: data.billing_address.phone,
			postcode: data.billing_address.postcode,
			state: data.billing_address.state,
		},
		additionalFields: additionalFields(data.additional_fields),
		customerNote: data.customer_note,
		paymentMethod: data.payment_method,
		paymentResult: data.payment_result?.payment_status
			? {
					status: paymentStatus(data.payment_result.payment_status),
					redirectUrl: data.payment_result.redirect_url,
					data: data.payment_result.payment_details,
				}
			: null,
	}
}

/**
 * WooCommerce registers `additional_fields` as a bare object, so the contract describes it as one
 * with undescribed contents: what a site's checkout fields are is a per-site question that no schema
 * can answer ahead of time. The values are scalars in practice, and anything else is dropped rather
 * than passed on to fail the procedure's own output validation with a less useful message.
 */
function additionalFields(fields: Record<string, unknown> | undefined): Record<string, string | boolean> {
	const kept: Record<string, string | boolean> = {}
	for (const [key, value] of Object.entries(fields ?? {})) {
		if (typeof value === "string" || typeof value === "boolean") kept[key] = value
	}
	return kept
}

/**
 * WooCommerce names the four statuses in the field's description and declares the field a plain
 * string, so the contract cannot narrow it. `error` is the safe reading of anything unrecognized: a
 * gateway that answered with something new has not taken payment as far as this checkout knows.
 */
function paymentStatus(status: string): NonNullable<Checkout["paymentResult"]>["status"] {
	switch (status) {
		case "success":
		case "pending":
		case "failure":
			return status
		default:
			return "error"
	}
}
