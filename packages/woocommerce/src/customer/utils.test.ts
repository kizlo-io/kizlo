import { expect, test } from "vitest"
import { Customer } from "./schema"
import type { WCK_Customer } from "./types"
import { deserializeCustomer } from "./utils"

function customer(overrides: Record<string, unknown> = {}): WCK_Customer {
	const address = {
		first_name: "Ada",
		last_name: "Lovelace",
		company: "",
		address_1: "1 Computing Lane",
		address_2: "",
		city: "London",
		state: "",
		postcode: "SW1A 1AA",
		country: "GB",
		phone: "",
	}

	return {
		id: 1,
		avatar_url: "",
		additional_fields: {},
		billing: { ...address, additional_fields: { "kizlo/tax-id": "GB-42" }, email: "ada@example.com" },
		shipping: { ...address, additional_fields: {} },
		email: "ada@example.com",
		first_name: "Ada",
		last_name: "Lovelace",
		is_paying_customer: true,
		meta_data: [],
		date_created: "2026-01-02T08:34:05",
		date_created_gmt: "2026-01-02T03:04:05",
		date_modified: "2026-01-02T08:34:05",
		date_modified_gmt: "2026-01-02T03:04:05",
		role: "customer",
		username: "ada",
		...overrides,
	} as WCK_Customer
}

test("registeredAt reads date_created_gmt in every host timezone", () => {
	const original = process.env.TZ
	const expected = Date.UTC(2026, 0, 2, 3, 4, 5)

	try {
		for (const timezone of ["UTC", "Asia/Kolkata"]) {
			process.env.TZ = timezone
			expect(deserializeCustomer(customer()).registeredAt).toBe(expected)
		}
	} finally {
		if (original === undefined) delete process.env.TZ
		else process.env.TZ = original
	}
})

test("an invalid GMT customer date normalizes to the non-null timestamp sentinel", () => {
	expect(deserializeCustomer(customer({ date_created_gmt: "invalid" })).registeredAt).toBe(0)
})

test("deserializes the canonical billing Tax ID and normalizes an absent value", () => {
	expect(deserializeCustomer(customer()).billing.taxId).toBe("GB-42")

	const withoutTaxId = customer()
	delete withoutTaxId.billing.additional_fields["kizlo/tax-id"]
	expect(deserializeCustomer(withoutTaxId).billing.taxId).toBe("")
	expect(deserializeCustomer(withoutTaxId).shipping).not.toHaveProperty("taxId")
})

test("reads customer address and contact adapters with false, empty and missing values", () => {
	const data = customer()
	data.billing.additional_fields = { "qa/reference": "BILL", "qa/address-flag": false }
	data.shipping.additional_fields = { "qa/reference": "SHIP" }
	data.additional_fields = { "qa/opt-in": false }
	const result = deserializeCustomer(data)
	expect(result.billing.additionalFields).toEqual({ "qa/reference": "BILL", "qa/address-flag": false })
	expect(result.shipping.additionalFields).toEqual({ "qa/reference": "SHIP" })
	expect(result.additionalFields).toEqual({ "qa/opt-in": false })
	expect(deserializeCustomer(customer()).additionalFields).toEqual({})
})

test("customer responses require normalized address buckets even with an older plugin", () => {
	const data = customer()
	delete (data.billing as unknown as Record<string, unknown>).additional_fields
	delete (data.shipping as unknown as Record<string, unknown>).additional_fields
	delete (data as unknown as Record<string, unknown>).additional_fields
	const result = deserializeCustomer(data)
	expect(result.billing.additionalFields).toEqual({})
	expect(result.shipping.additionalFields).toEqual({})
	expect(result.additionalFields).toEqual({})
	expect(Customer.parse(result)).toEqual(result)
	for (const group of ["billing", "shipping"] as const) {
		expect(Customer.safeParse({ ...result, [group]: { ...result[group], additionalFields: undefined } }).success).toBe(false)
	}
})

test("canonical grouped fields win over any legacy per-field response property", () => {
	const data = customer()
	Object.assign(data.billing, { tax_id: "stale" })
	expect(deserializeCustomer(data).billing.taxId).toBe("GB-42")
	expect(deserializeCustomer(data).billing.additionalFields).not.toHaveProperty("kizlo/tax-id")
})
