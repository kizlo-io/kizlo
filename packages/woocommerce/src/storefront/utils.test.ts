import { expect, test } from "vitest"
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
			fields: {
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
			},
			field_locations: { address: ["postcode", "kizlo/tax-id"], contact: ["email"], order: [] },
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
			local_pickup: { enabled: false, title: "Pickup", cost: "" },
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
	const taxId = deserializeStorefront(storefront()).address.fields["kizlo/tax-id"]

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
