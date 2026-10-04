import type { Checkout } from "./checkout/schema"
import { resolveCheckoutFieldTarget } from "./checkout-fields"

const target = resolveCheckoutFieldTarget({ address: ["first_name"], contact: ["email"], order: [] }, "first_name", "billing")
if (target) {
	const key: "firstName" = target.path[1]
	const value: Checkout["billingAddress"][typeof key] = "Ada"
	// @ts-expect-error A normalized core string field never accepts a checkbox boolean.
	const wrongValue: Checkout["billingAddress"][typeof key] = false
	// @ts-expect-error A raw Woo key is not a normalized SDK target.
	const wrongKey: "first_name" = target.path[1]
	void [value, wrongValue, wrongKey]
}
const projected = resolveCheckoutFieldTarget({ address: ["kizlo/tax-id"], contact: [], order: [] }, "kizlo/tax-id", "billing")
if (projected) {
	const key: "taxId" = projected.path[1]
	const value: Checkout["billingAddress"][typeof key] = "GB"
	// @ts-expect-error The native projection remains a string in the generated consumer contract.
	const wrongValue: Checkout["billingAddress"][typeof key] = 42
	void [value, wrongValue]
}
