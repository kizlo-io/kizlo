import { expect, test } from "vitest"
import { applyCheckoutValidation, matchCheckoutRegisteredFields } from "../../docs/checkout-validation-example"
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

function definition(id: string, location: "address" | "contact" | "order") {
	return StorefrontField.parse({
		id,
		location,
		bindings:
			location === "address"
				? { billing: ["additionalFields", id], shipping: ["additionalFields", id] }
				: { other: ["additionalFields", id] },
		label: id,
		optionalLabel: id,
		required: false,
		hidden: false,
		type: "text",
		schema: { type: "string" },
		attributes: {},
		autocomplete: null,
		index: null,
		placeholder: null,
		options: [],
	})
}

test("standalone matching uses only normalized references and refuses duplicate/conflicting bindings", () => {
	const literal = definition("billing_address.foo/reference", "contact")
	const address = definition("foo/reference", "address")
	const issue = checkoutValidationData({ code: "required", message: "Required", data: { params: { [literal.id]: "Required" } } }).issues[0]
	if (!issue) throw new Error("Expected registered-field evidence")
	// Diagnostic evidence may change without altering the normalized contract.
	issue.source = "ignored diagnostic"
	issue.sourcePath = ["ignored", "diagnostic"]
	expect(matchCheckoutRegisteredFields(issue, [literal])).toEqual(["additionalFields", literal.id])
	expect(matchCheckoutRegisteredFields(issue, [address])).toEqual(["billingAddress", "additionalFields", address.id])
	expect(matchCheckoutRegisteredFields(issue, [literal, address])).toBeNull()
	expect(matchCheckoutRegisteredFields(issue, [literal, literal])).toBeNull()
	expect(matchCheckoutRegisteredFields(issue, [])).toBeNull()
})

test("standalone matching preserves ambiguous, unknown and bare address messages", () => {
	const id = 'plugin/a.b["quote"]%2Fvalue'
	const data = checkoutValidationData({
		code: "required",
		message: "Required",
		data: { params: { [id]: ["First", "Second"], unknown: "Unknown" } },
	})
	const fields: string[] = []
	const summary: string[] = []
	applyCheckoutValidation(data, [definition(id, "address")], {
		field: (_path, message) => fields.push(message),
		summary: (message) => summary.push(message),
	})
	expect(fields).toEqual([])
	expect(summary).toEqual(["First", "Second", "Unknown"])
	const explicit = checkoutValidationData({
		code: "required",
		message: "Required",
		data: { details: { shipping_address: { message: "Shipping", data: { key: id } } } },
	})
	const issue = explicit.issues[0]
	if (!issue) throw new Error("Expected shipping reference")
	expect(matchCheckoutRegisteredFields(issue, [definition(id, "address")])).toEqual(["shippingAddress", "additionalFields", id])
})

test("nested explicit messages cannot select a field from a speculative interpretation", () => {
	const data = checkoutValidationData({
		code: "required",
		message: "Required",
		data: { errors: [{ data: { path: ["billing_address.foo/reference"] }, details: ["First", "Second"] }] },
	})
	const fields: [readonly string[], string][] = []
	const summary: string[] = []
	applyCheckoutValidation(data, [definition("foo/reference", "address")], {
		field: (path, message) => fields.push([path, message]),
		summary: (message) => summary.push(message),
	})
	expect(fields).toEqual([])
	expect(summary).toEqual(["First", "Second"])
})

test.each(["billing", "shipping"] as const)("standalone matching honors explicit %s context on parameter identities", (group) => {
	const data = checkoutValidationData({
		code: "required",
		message: "Required",
		data: { errors: [{ message: "Required", data: { param: "foo/reference", group } }] },
	})
	const issue = data.issues[0]
	if (!issue) throw new Error("Expected address reference")
	expect(matchCheckoutRegisteredFields(issue, [definition("foo/reference", "address")])).toEqual([
		`${group}Address`,
		"additionalFields",
		"foo/reference",
	])
})
