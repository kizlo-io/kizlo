import { expect, test } from "vitest"
import { Checkout, ConfirmCheckoutInput, RetryCheckoutInput } from "./schema"

test("checkout schema has no embedded cart", () => {
	expect(Checkout.shape).not.toHaveProperty("cart")
})

test.each(["0", "1250", "001250", "9007199254740993"])("reviewed total %s survives parsing unchanged", (expectedTotal) => {
	expect(ConfirmCheckoutInput.shape.expectedTotal.parse(expectedTotal)).toBe(expectedTotal)
})

test("reviewed total is optional", () => {
	expect(ConfirmCheckoutInput.shape.expectedTotal.parse(undefined)).toBeUndefined()
})

test.each(["", "-1", "+1", "1.5", "1e3", "a", " 1", "1 ", "1\n", "１２", 0, 1250, null, false])(
	"reviewed total rejects %j without coercion",
	(expectedTotal) => {
		expect(ConfirmCheckoutInput.shape.expectedTotal.safeParse(expectedTotal).success).toBe(false)
	},
)

for (const [operation, schema] of Object.entries({ confirm: ConfirmCheckoutInput, retry: RetryCheckoutInput })) {
	const input = { paymentMethod: "bacs", key: "key", orderId: 42 }

	test(`${operation} accepts minimal billing and partial shipping without address defaults`, () => {
		const billingAddress = { additionalFields: {} }
		const shippingAddress = { city: "London", additionalFields: { "qa/address-flag": false } }
		const parsed = schema.parse({ ...input, billingAddress, shippingAddress })
		expect(parsed.billingAddress).toEqual(billingAddress)
		expect(parsed.shippingAddress).toEqual(shippingAddress)
		expect(schema.parse({ ...input, billingAddress })).not.toHaveProperty("shippingAddress")
	})

	test(`${operation} retains explicit empty core fields and Tax ID`, () => {
		const billingAddress = { email: "", company: "", address2: "", phone: "", taxId: "", additionalFields: {} }
		expect(schema.parse({ ...input, billingAddress }).billingAddress).toEqual(billingAddress)
	})

	test(`${operation} requires billing and additionalFields on supplied addresses`, () => {
		expect(schema.safeParse(input).success).toBe(false)
		expect(schema.safeParse({ ...input, billingAddress: {} }).success).toBe(false)
		expect(schema.safeParse({ ...input, billingAddress: { additionalFields: {} }, shippingAddress: {} }).success).toBe(false)
	})

	test.each([null, [], { "qa/reference": 42 }, { "kizlo/tax-id": "GB" }])(
		`${operation} rejects invalid billing additionalFields %j`,
		(additionalFields) => {
			expect(schema.safeParse({ ...input, billingAddress: { additionalFields } }).success).toBe(false)
		},
	)
}
