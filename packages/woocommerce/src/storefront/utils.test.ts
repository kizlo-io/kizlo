import { expect, test } from "vitest"
import { deserializeCartBillingAddress, serializeCartBillingAddress } from "../cart/utils"
import { Storefront } from "./schema"
import type { WCK_Storefront } from "./types"
import { deserializeStorefront } from "./utils"

function storefront(): WCK_Storefront {
	return {
		address: {
			countries: [
				{
					code: "IN",
					name: "India",
					allowBilling: true,
					allowShipping: true,
					states: [
						{ code: "MH", name: "Maharashtra" },
						{ code: "DL", name: "Delhi" },
					],
					locale: { postcode: { label: "PIN Code" }, state: { label: "State" } },
					format: "{name}\n{address_1}\n{city} {postcode}\n{state}\n{country}",
				},
				{
					code: "AE",
					name: "United Arab Emirates",
					allowBilling: true,
					allowShipping: false,
					states: [],
					locale: { postcode: { required: false, hidden: true }, state: { required: false } },
					format: "{name}\n{address_1}\n{city}\n{country}",
				},
				{
					code: "JP",
					name: "Japan",
					allowBilling: true,
					allowShipping: true,
					states: [
						{ code: "01", name: "Hokkaido" },
						{ code: "02", name: "Aomori" },
						{ code: "13", name: "Tokyo" },
					],
					locale: { postcode: { index: 65, class: ["form-row-first"] } },
					format: "{postcode}\n{state} {city}\n{country}",
				},
			],
			default_address_format: "{name}\n{address_1}\n{city}\n{country}",
			fields: Object.entries({
				postcode: {
					label: "Postal code",
					optionalLabel: "Postal code (optional)",
					required: true,
					hidden: false,
					autocomplete: "postal-code",
					index: 90,
				},
				"kizlo/tax-id": {
					label: "Tax ID",
					optionalLabel: "Tax ID (optional)",
					required: false,
					hidden: { customer: { properties: { address: { not: { required: ["email"] } } } } },
					type: "text",
					location: "address",
				},
			}).map(([id, field]) => ({ ...field, id, location: "address" as const, attributes: {}, schema: { type: "string" } })),
			base_country: "IN",
			default_country: null,
		},
		checkout: {
			allows_guest: true,
			coupons_enabled: true,
			forced_billing_address: false,
			taxes_enabled: true,
			display_cart_prices_including_tax: true,
			display_itemized_taxes: false,
			shipping_enabled: true,
			local_pickup: { enabled: false, title: "Pickup", cost: "", method_ids: ["local_pickup", "pickup_location"] },
		},
		pricing: {
			currency: {
				currency_code: "INR",
				currency_symbol: "₹",
				currency_minor_unit: 2,
				currency_decimal_separator: ".",
				currency_thousand_separator: ",",
				currency_prefix: "₹",
				currency_suffix: "",
			},
			prices_include_tax: true,
			display_shop_prices_including_tax: true,
			price_suffix: "incl. GST",
		},
		catalog: {
			weight_unit: "kg",
			dimension_unit: "cm",
			reviews_enabled: true,
			review_ratings_enabled: true,
			review_rating_required: true,
			reviews_verified_owners_only: false,
			stock_format: "",
			hide_out_of_stock: false,
			placeholder_image: "https://store.example/placeholder.png",
			cart_redirect_after_add: false,
		},
	}
}

test("the output parses against the storefront schema", () => {
	expect(Storefront.safeParse(deserializeStorefront(storefront())).success).toBe(true)
})

test("collection classification preserves plugin method IDs independently of pickup settings", () => {
	const raw = storefront()
	const ids = ["local_pickup", "vendor/Pickup.method[1]"]
	raw.checkout.local_pickup = { ...raw.checkout.local_pickup, method_ids: ids }
	const result = deserializeStorefront(raw)
	expect(result.checkout.localPickup).toEqual({ enabled: false, title: "Pickup", cost: "", methodIds: ids })
	expect(result.checkout.localPickup.methodIds).not.toBe(ids)
	expect(Storefront.safeParse(result).success).toBe(true)
})

test("collection classification distinguishes a known empty list from older or malformed responses", () => {
	for (const value of [undefined, null, "local_pickup", {}, ["local_pickup", 7], Array(1), []]) {
		const raw = storefront()
		const pickup = { enabled: false, title: "Pickup", cost: "", ...(value !== undefined && { method_ids: value }) }
		raw.checkout.local_pickup = pickup as WCK_Storefront["checkout"]["local_pickup"]
		const result = deserializeStorefront(raw)
		expect(result.checkout.localPickup.methodIds).toEqual(Array.isArray(value) && value.length === 0 ? [] : null)
		expect(Storefront.safeParse(result).success).toBe(true)
	}
})

test("countries keep WooCommerce's order and carry their states and label overrides", () => {
	const { countries } = deserializeStorefront(storefront()).address

	expect(countries.map((country) => country.code)).toEqual(["IN", "AE", "JP"])
	expect(countries[0]?.name).toBe("India")
	expect(countries[0]?.states).toEqual([
		{ code: "MH", name: "Maharashtra" },
		{ code: "DL", name: "Delhi" },
	])
	expect(countries[0]?.locale.postcode).toEqual({ label: "PIN Code" })
})

test("a country with no postcode and no states resolves without throwing", () => {
	const uae = deserializeStorefront(storefront()).address.countries.find((country) => country.code === "AE")

	expect(uae?.states).toEqual([])
	expect(uae?.locale.postcode).toEqual({ required: false, hidden: true })
	expect(uae?.allowShipping).toBe(false)
})

test("locale overrides keep only the keys a storefront reads", () => {
	const japan = deserializeStorefront(storefront()).address.countries.find((country) => country.code === "JP")

	expect(japan?.locale.postcode).toEqual({ index: 65 })
})

test("a plugin field keeps its conditional rule and gets defaults for missing keys", () => {
	const taxId = deserializeStorefront(storefront()).address.fields.find((field) => field.id === "kizlo/tax-id")

	expect(taxId?.required).toBe(false)
	expect(taxId?.hidden).toEqual({ customer: { properties: { address: { not: { required: ["email"] } } } } })
	expect(taxId?.autocomplete).toBeNull()
	expect(taxId?.options).toEqual([])
})

test("pricing reuses the shared currency format", () => {
	const { pricing } = deserializeStorefront(storefront())

	expect(pricing.currency.currencyCode).toBe("INR")
	expect(pricing.currency.currencyPrefix).toBe("₹")
	expect(pricing.priceSuffix).toBe("incl. GST")
})

test("SDK definitions own core, native and literal additional-field bindings", () => {
	const raw = storefront()
	raw.address.fields.push({
		id: "plug/a.b[0]",
		location: "address",
		label: "Reference",
		optionalLabel: "Reference",
		required: false,
		hidden: false,
		attributes: { pattern: "^[A-Z]+$" },
		schema: { type: "string", pattern: "^[A-Z]+$" },
	})
	const fields = deserializeStorefront(raw).address.fields
	expect(fields.find((field) => field.id === "postcode")?.bindings).toEqual({ billing: ["postcode"], shipping: ["postcode"] })
	expect(fields.find((field) => field.id === "kizlo/tax-id")?.bindings).toEqual({ billing: ["taxId"] })
	expect(fields.at(-1)).toMatchObject({
		attributes: { pattern: "^[A-Z]+$" },
		schema: { type: "string", pattern: "^[A-Z]+$" },
		bindings: { billing: ["additionalFields", "plug/a.b[0]"], shipping: ["additionalFields", "plug/a.b[0]"] },
	})
})
test("contact and order bindings follow checkout values", () => {
	const raw = storefront()
	for (const [id, location] of [
		["email", "contact"],
		["plug/consent", "contact"],
		["plug/note", "order"],
	] as const)
		raw.address.fields.push({
			id,
			location,
			label: id,
			optionalLabel: id,
			required: false,
			hidden: false,
			attributes: {},
			schema: { type: "string" },
		})
	expect(
		deserializeStorefront(raw)
			.address.fields.slice(-3)
			.map((field) => field.bindings),
	).toEqual([
		{ other: ["billingAddress", "email"] },
		{ other: ["additionalFields", "plug/consent"] },
		{ other: ["additionalFields", "plug/note"] },
	])
})

test("field bindings read exactly the values serialized back to Woo", () => {
	const wire = {
		first_name: "Ada",
		last_name: "Lovelace",
		company: "",
		address_1: "12 Market Street",
		address_2: "",
		city: "Bengaluru",
		state: "KA",
		postcode: "560001",
		country: "IN",
		phone: "",
		email: "ada@example.com",
		"kizlo/tax-id": "GST123",
		"plug/a.b[0]": "ABC",
	}
	const values = deserializeCartBillingAddress(wire)
	const raw = storefront()
	for (const id of ["first_name", "address_1", "plug/a.b[0]"])
		raw.address.fields.push({
			id,
			location: "address",
			label: id,
			optionalLabel: id,
			required: false,
			hidden: false,
			attributes: {},
			schema: { type: "string" },
		})
	const serialized = serializeCartBillingAddress(values)
	for (const field of deserializeStorefront(raw).address.fields) {
		let value: unknown = values
		for (const segment of field.bindings.billing ?? []) value = (value as Record<string, unknown>)[segment]
		expect(value).toEqual(serialized[field.id])
	}
})

test("registered HTML constraints retain rendering strings and numeric full-match schema constraints", () => {
	const raw = storefront()
	raw.address.fields.push({
		id: "plug/reference",
		location: "order",
		label: "Reference",
		optionalLabel: "Reference",
		required: true,
		hidden: false,
		attributes: { maxLength: "30", pattern: "[0-9]{4}" },
		schema: { allOf: [{ type: "string", maxLength: 30, pattern: "^(?:[0-9]{4})$" }, { pattern: "[0-9]{2}" }] },
	})
	const definition = deserializeStorefront(raw).address.fields.at(-1)
	expect(definition).toMatchObject({
		required: true,
		attributes: { maxLength: "30", pattern: "[0-9]{4}" },
		schema: { allOf: [{ type: "string", maxLength: 30, pattern: "^(?:[0-9]{4})$" }, { pattern: "[0-9]{2}" }] },
		bindings: { other: ["additionalFields", "plug/reference"] },
	})
})
