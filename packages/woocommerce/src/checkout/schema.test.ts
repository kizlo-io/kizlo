import { expect, test } from "vitest"
import { Checkout, ConfirmCheckoutInput } from "./schema"

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
