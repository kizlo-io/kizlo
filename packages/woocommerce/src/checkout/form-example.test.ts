import { expect, test } from "vitest"
import { applyCheckoutValidation } from "../../docs/checkout-validation-example"
import { StorefrontField } from "../storefront/schema"
import { checkoutValidationData } from "./validation"

test("consumer handlers receive literal paths and every field/summary message", () => {
	const data = checkoutValidationData({
		code: "rest_invalid_param",
		message: "Invalid checkout",
		data: {
			details: {
				billing_address: { postcode: ["Invalid postcode", "Too short"], "kizlo/tax-id": "Tax ID required" },
				shipping_address: "Invalid address",
				mystery: "Plugin rejected checkout",
				additional_fields: { "plug/a.b[0]": "Note required" },
			},
		},
	})
	const definitions = [
		StorefrontField.parse({
			id: "plug/a.b[0]",
			location: "order",
			bindings: { other: ["additionalFields", "plug/a.b[0]"] },
			label: "Note",
			optionalLabel: "Note",
			required: false,
			hidden: false,
			type: "text",
			schema: { type: "string" },
			attributes: {},
			autocomplete: null,
			index: null,
			placeholder: null,
			options: [],
		}),
	]
	const fields: [readonly string[], string][] = []
	const summary: string[] = []
	applyCheckoutValidation(data, definitions, {
		field: (path, message) => fields.push([path, message]),
		summary: (message) => summary.push(message),
	})
	expect(fields).toEqual([
		[["billingAddress", "postcode"], "Invalid postcode"],
		[["billingAddress", "postcode"], "Too short"],
		[["billingAddress", "taxId"], "Tax ID required"],
		[["additionalFields", "plug/a.b[0]"], "Note required"],
	])
	expect(summary).toEqual(["Invalid address", "Plugin rejected checkout"])
})
