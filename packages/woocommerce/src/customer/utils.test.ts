import { expect, test } from "vitest"
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
		billing: { ...address, email: "ada@example.com" },
		shipping: address,
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
