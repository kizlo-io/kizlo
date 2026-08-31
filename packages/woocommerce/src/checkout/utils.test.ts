import { expect, test } from "vitest"
import { Checkout } from "./schema"
import type { WCK_Checkout } from "./types"
import { deserializeCheckout, serializeCheckoutBillingAddress, serializeCheckoutShippingAddress } from "./utils"

const shippingAddress = {
	first_name: "Ada",
	last_name: "Lovelace",
	company: "",
	address_1: "1 Store Street",
	address_2: "",
	city: "London",
	state: "",
	postcode: "SW1A 1AA",
	country: "GB",
	phone: "0123456789",
	delivery_note: "Leave at reception",
}

export function rawCheckout(overrides: Partial<WCK_Checkout> = {}): WCK_Checkout {
	return {
		order_id: 0,
		order_number: "0",
		order_key: "",
		status: "checkout-draft",
		customer_id: 0,
		customer_note: "",
		billing_address: { ...shippingAddress, email: "ada@example.com", tax_exempt: false } as unknown as WCK_Checkout["billing_address"],
		shipping_address: shippingAddress,
		payment_method: "",
		payment_result: null,
		additional_fields: {
			gift_message: "",
			marketing_opt_in: false,
			ignored: { nested: true },
		} as unknown as WCK_Checkout["additional_fields"],
		__experimentalCart: null,
		extensions: {
			kizlo: { private: true },
			acme: { checkout: true },
		} as unknown as WCK_Checkout["extensions"],
		...overrides,
	}
}

test("deserializes draft sentinels, dynamic fields, and opaque extensions", () => {
	const result = deserializeCheckout(rawCheckout())

	expect(Checkout.safeParse(result).success).toBe(true)
	expect(result).toMatchObject({
		orderId: null,
		orderNumber: null,
		orderKey: null,
		customerId: null,
		paymentMethod: null,
		paymentResult: null,
		billingAddress: { additionalFields: { tax_exempt: false } },
		shippingAddress: { additionalFields: { delivery_note: "Leave at reception" } },
		additionalFields: { gift_message: "", marketing_opt_in: false },
		extensions: { acme: { checkout: true } },
	})
	expect(result.extensions).not.toHaveProperty("kizlo")
})

test("preserves custom payment statuses and normalizes empty redirects", () => {
	const result = deserializeCheckout(
		rawCheckout({
			order_id: 42,
			order_number: "WC-42",
			order_key: "wc_order_key",
			customer_id: 7,
			payment_method: "custom_gateway" as WCK_Checkout["payment_method"],
			payment_result: {
				payment_status: "awaiting-webhook",
				payment_details: [{ key: "transaction", value: "tx_42" }],
				redirect_url: "",
			},
		}),
	)

	expect(result).toMatchObject({
		orderId: 42,
		orderNumber: "WC-42",
		orderKey: "wc_order_key",
		customerId: 7,
		paymentMethod: "custom_gateway",
		paymentResult: {
			status: "awaiting-webhook",
			details: [{ key: "transaction", value: "tx_42" }],
			redirectUrl: null,
		},
	})
})

test("reuses cart address serialization and preserves merchant fields", () => {
	const publicShipping = {
		firstName: "Ada",
		lastName: "Lovelace",
		company: "",
		address1: "1 Store Street",
		address2: "",
		city: "London",
		state: "",
		postcode: "SW1A 1AA",
		country: "GB",
		phone: "0123456789",
		additionalFields: { delivery_note: "Reception", fragile: false, first_name: "Cannot override" },
	}

	expect(serializeCheckoutShippingAddress(publicShipping)).toMatchObject({
		first_name: "Ada",
		delivery_note: "Reception",
		fragile: false,
	})
	expect(serializeCheckoutBillingAddress({ ...publicShipping, email: "ada@example.com" })).toMatchObject({
		first_name: "Ada",
		email: "ada@example.com",
		delivery_note: "Reception",
	})
})
