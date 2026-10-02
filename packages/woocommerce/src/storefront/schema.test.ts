import { CurrencyFormat } from "kizlo"
import { expect, test } from "vitest"
import { Storefront, StorefrontCountry, StorefrontField, StorefrontPricing } from "./schema"

const field = {
	label: "Postal code",
	optionalLabel: "Postal code (optional)",
	required: true,
	hidden: false,
	type: null,
	autocomplete: "postal-code",
	index: 90,
	placeholder: null,
	options: [],
}

test("pricing reuses the shared currency format", () => {
	expect(StorefrontPricing.shape.currency).toBe(CurrencyFormat)
})

test("a country with no postcode and no states parses", () => {
	const uae = {
		code: "AE",
		name: "United Arab Emirates",
		allowBilling: true,
		allowShipping: true,
		states: [],
		locale: { postcode: { required: false, hidden: true } },
		format: "{name}\n{address_1}\n{city}\n{country}",
	}

	expect(StorefrontCountry.safeParse(uae).success).toBe(true)
})

test("a field rule is a boolean or a conditional rule object, nothing else", () => {
	expect(StorefrontField.safeParse(field).success).toBe(true)
	expect(StorefrontField.safeParse({ ...field, hidden: { customer: { properties: {} } } }).success).toBe(true)
	expect(StorefrontField.safeParse({ ...field, required: "yes" }).success).toBe(false)
})

test("every section is required", () => {
	expect(Storefront.safeParse({ address: {}, checkout: {}, pricing: {} }).success).toBe(false)
})
