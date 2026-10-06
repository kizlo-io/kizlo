import { expect, test } from "vitest"
import { CheckoutValidationData, checkoutValidationData, resolveCheckoutValidationIssues } from "./validation"

const definitions = [
	{
		id: "plug/a.b[0]",
		location: "address" as const,
		bindings: { billing: ["additionalFields", "plug/a.b[0]"], shipping: ["additionalFields", "plug/a.b[0]"] },
	},
	{ id: "contact/opt-in", location: "contact" as const, bindings: { other: ["additionalFields", "contact/opt-in"] } },
	{ id: "order/note", location: "order" as const, bindings: { other: ["additionalFields", "order/note"] } },
	{ id: "kizlo/tax-id", location: "address" as const, bindings: { billing: ["taxId"] } },
]
function normalize(data: unknown) {
	return checkoutValidationData({ code: "rest_invalid_param", message: "Invalid checkout", data })
}

test.each([
	["billing_email", ["billingAddress", "email"]],
	["billing_address[first_name]", ["billingAddress", "firstName"]],
	["shipping_address.last_name", ["shippingAddress", "lastName"]],
	["billingAddress.address1", ["billingAddress", "address1"]],
	["billing_firstName", ["billingAddress", "firstName"]],
	["shipping_postcode", ["shippingAddress", "postcode"]],
	["billing_address[kizlo/tax-id]", ["billingAddress", "taxId"]],
])("normalizes core/native source %s without a consumer table", (source, target) => {
	const data = normalize({ params: { [source]: "Required" } })
	expect(resolveCheckoutValidationIssues(data, [])).toEqual([
		{ source, sourcePath: expect.any(Array), code: "rest_invalid_param", message: "Required", scope: "field", target },
	])
	expect(CheckoutValidationData.safeParse(data).success).toBe(true)
})

test("preserves detailed evidence and refines only known tax-ID identity", () => {
	const upstream = {
		params: { billing_address: "Required" },
		details: {
			billing_address: {
				code: "woocommerce_required_checkout_field",
				message: "Required",
				data: { param: "billing_address", field: "kizlo/tax-id", group: "billing" },
			},
		},
	}
	const data = normalize(upstream)
	expect(Object.keys(data)).toEqual(["issues"])
	expect(data.issues).toHaveLength(1)
	expect(data.issues[0]).toMatchObject({
		scope: "field",
		target: ["billingAddress", "taxId"],
		source: "billing_address",
		code: "woocommerce_required_checkout_field",
		sourcePath: ["billing_address", "kizlo/tax-id"],
	})
	expect(data).not.toHaveProperty("fields")
	expect(data).not.toHaveProperty("upstream")
	expect(normalize({ details: { billing_address: { code: "required", message: "Required" } } }).issues[0]).toMatchObject({
		scope: "group",
		target: ["billingAddress"],
	})
})

test("nested details preserve separate messages, codes and sibling field identities", () => {
	const data = normalize({
		details: {
			billing_address: {
				code: "invalid_postcode",
				message: "Bad postcode",
				additional_errors: [
					{ code: "invalid_country", message: "Bad country" },
					{ code: "invalid_postcode", message: "Bad postcode" },
				],
			},
			shipping_address: {
				data: {
					details: {
						first_name: { code: "missing", message: "First name required", data: { param: "first_name" } },
						last_name: ["Last name required", "Too short"],
					},
				},
			},
		},
	})
	expect(data.issues.map(({ message, target, code }) => ({ message, target, code }))).toEqual([
		{ message: "Bad postcode", target: ["billingAddress", "postcode"], code: "invalid_postcode" },
		{ message: "Bad country", target: ["billingAddress", "country"], code: "invalid_country" },
		{ message: "First name required", target: ["shippingAddress", "firstName"], code: "missing" },
		{ message: "Last name required", target: ["shippingAddress", "lastName"], code: "rest_invalid_param" },
		{ message: "Too short", target: ["shippingAddress", "lastName"], code: "rest_invalid_param" },
	])
})

test("resolves all registered locations from data-only bindings and preserves literal IDs", () => {
	const data = normalize({
		details: {
			billing_address: { "plug/a.b[0]": "Billing required" },
			shipping_address: { "plug/a.b[0]": "Shipping required" },
			additional_fields: { "contact/opt-in": "Consent required", "order/note": "Note required" },
		},
	})
	const before = structuredClone(data)
	expect(resolveCheckoutValidationIssues(data, definitions).map((issue) => issue.target)).toEqual([
		["billingAddress", "additionalFields", "plug/a.b[0]"],
		["shippingAddress", "additionalFields", "plug/a.b[0]"],
		["additionalFields", "contact/opt-in"],
		["additionalFields", "order/note"],
	])
	expect(data).toEqual(before)
	expect(
		resolveCheckoutValidationIssues(normalize({ params: { "billing_address[plug/a.b[0]]": "Required" } }), definitions)[0]?.target,
	).toEqual(["billingAddress", "additionalFields", "plug/a.b[0]"])
})

test.each([
	"plug/a.b[0]",
	"kizlo/tax-id",
	"unknown/id",
	"billing_address[unknown/id]",
	"shipping_address[kizlo/tax-id]",
	"shipping_address[email]",
])("does not invent precision for %s", (source) => {
	const issue = resolveCheckoutValidationIssues(normalize({ params: { [source]: "Required" } }), definitions)[0]
	expect(issue).toMatchObject({ scope: "unresolved", target: null, message: "Required" })
})

test("bare contact/order identities resolve; duplicate registry identity stays unresolved", () => {
	const data = normalize({ params: { "contact/opt-in": "Required", "order/note": "Required" } })
	expect(resolveCheckoutValidationIssues(data, definitions).every((issue) => issue.scope === "field")).toBe(true)
	expect(
		resolveCheckoutValidationIssues(data, [...definitions, ...definitions.filter((field) => field.id === "contact/opt-in")])[0]?.scope,
	).toBe("unresolved")
})

test.each([undefined, null, false, 42, "invalid", [], { params: null, details: false }, { details: { broken: { message: 42 } } }])(
	"keeps a summary for malformed or missing data %j",
	(data) => {
		expect(normalize(data).issues).toEqual([
			{ source: null, sourcePath: [], code: "rest_invalid_param", message: "Invalid checkout", scope: "unresolved", target: null },
		])
	},
)

test("retains group, unknown and multiple string messages rather than interpreting prose", () => {
	const data = normalize({
		params: { billing_address: "Tax ID required", mystery: ["One", "Two"] },
		details: { additional_fields: "Invalid group" },
	})
	expect(data.issues).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ scope: "group", target: ["billingAddress"], message: "Tax ID required" }),
			expect.objectContaining({ scope: "group", target: ["additionalFields"] }),
			expect.objectContaining({ scope: "unresolved", message: "One" }),
			expect.objectContaining({ scope: "unresolved", message: "Two" }),
		]),
	)
})

test("WooCommerce 11 field-key details resolve each group, including additional_errors", () => {
	const data = normalize({
		params: { billing_address: "Required", additional_fields: "Consent required" },
		details: {
			billing_address: {
				code: "woocommerce_required_checkout_field",
				message: "Required",
				data: { key: "kizlo/tax-id" },
				additional_errors: [
					{ code: "woocommerce_invalid_checkout_field", message: "Invalid reference", data: { key: "plug/a.b[0]", location: "address" } },
				],
			},
			additional_fields: {
				code: "woocommerce_required_checkout_field",
				message: "Consent required",
				data: { key: "contact/opt-in" },
				additional_errors: [
					{ code: "woocommerce_required_checkout_field", message: "Note required", data: { key: "order/note", location: "order" } },
				],
			},
		},
	})
	expect(resolveCheckoutValidationIssues(data, definitions).map(({ target, scope, message }) => ({ target, scope, message }))).toEqual([
		{ scope: "field", target: ["billingAddress", "taxId"], message: "Required" },
		{ scope: "field", target: ["billingAddress", "additionalFields", "plug/a.b[0]"], message: "Invalid reference" },
		{ scope: "field", target: ["additionalFields", "contact/opt-in"], message: "Consent required" },
		{ scope: "field", target: ["additionalFields", "order/note"], message: "Note required" },
	])
})

test("an explicit parent parameter remains a group rather than a fabricated child", () => {
	expect(
		normalize({ details: { billing_address: { message: "Invalid billing", data: { param: "billing_address" } } } }).issues[0],
	).toMatchObject({ scope: "group", target: ["billingAddress"], sourcePath: ["billing_address"] })
})

test("custom envelopes retain unidentified nested errors and independent codes", () => {
	const data = normalize({
		errors: [
			{ code: "plugin_one", message: "One" },
			{ code: "plugin_two", message: "Two" },
		],
	})
	expect(data.issues.map((issue) => [issue.scope, issue.code, issue.message])).toEqual([
		["unresolved", "plugin_one", "One"],
		["unresolved", "plugin_two", "Two"],
	])
})

test("the public data schema accepts only issues", () => {
	expect(CheckoutValidationData.safeParse({ issues: [] }).success).toBe(true)
	for (const extra of [{ fields: {} }, { upstream: {} }]) {
		expect(CheckoutValidationData.safeParse({ issues: [], ...extra }).success).toBe(false)
	}
})

test("parent messages coexist with direct and data-nested errors, details and message arrays", () => {
	const data = normalize({
		details: {
			billing_address: {
				code: "invalid_address",
				message: "Address invalid",
				details: { postcode: { code: "postcode_format", message: ["Invalid postcode", "Too short"] } },
				additional_errors: [{ code: "group_rule", message: "Group failed" }],
				data: {
					errors: [{ code: "unknown_one", message: "First unknown" }],
					additional_errors: [{ code: "unknown_two", message: "Second unknown" }],
					details: { country: { code: "country_rule", message: "Country required" } },
				},
			},
		},
	})
	expect(data.issues.map(({ message }) => message).sort()).toEqual(
		["Address invalid", "Group failed", "Invalid postcode", "Too short", "First unknown", "Second unknown", "Country required"].sort(),
	)
	expect(data.issues.find(({ message }) => message === "Invalid postcode")).toMatchObject({
		source: "billing_address",
		sourcePath: ["billing_address", "postcode"],
		code: "postcode_format",
		target: ["billingAddress", "postcode"],
	})
	expect(data.issues.find(({ message }) => message === "Group failed")).toMatchObject({ scope: "group", target: ["billingAddress"] })
})

test("nested params retain different identities even when their messages match", () => {
	const data = normalize({ params: { shipping_address: { first_name: "Required", last_name: "Required" } } })
	expect(data.issues.map(({ target }) => target)).toEqual([
		["shippingAddress", "firstName"],
		["shippingAddress", "lastName"],
	])
})

test("deep additional_errors retain the leaf message instead of dropping it at a traversal limit", () => {
	let nested: unknown = { code: "plugin_leaf", message: "Deep failure", data: { param: "billing_address", key: "kizlo/tax-id" } }
	for (let i = 0; i < 40; i++) nested = { data: { additional_errors: [nested] } }
	expect(normalize({ errors: [nested] }).issues).toEqual([
		{
			source: "billing_address",
			sourcePath: ["billing_address", "kizlo/tax-id"],
			code: "plugin_leaf",
			message: "Deep failure",
			scope: "field",
			target: ["billingAddress", "taxId"],
		},
	])
})

test("top-level message envelopes and array errors survive without exposing their payload", () => {
	const data = normalize({ code: "plugin_rule", message: "Whole checkout failed", details: { mystery: "Unknown failed" } })
	expect(data.issues.map(({ message, code }) => [message, code])).toEqual([
		["Whole checkout failed", "plugin_rule"],
		["Unknown failed", "plugin_rule"],
	])
	expect(
		normalize([
			{ code: "one", message: "One" },
			{ code: "two", message: "Two" },
		]).issues.map(({ message }) => message),
	).toEqual(["One", "Two"])
	const cyclic: Record<string, unknown> = {}
	cyclic.errors = [cyclic]
	expect(normalize(cyclic).issues[0]).toMatchObject({ scope: "unresolved", message: "Invalid checkout", target: null })
})

test.each(["billing_plugin/reference", "shipping_plugin/reference"])("preserves the bare contact ID %s", (id) => {
	const data = normalize({ params: { [id]: "Required" } })
	expect(
		resolveCheckoutValidationIssues(data, [{ id, location: "contact", bindings: { other: ["additionalFields", id] } }])[0],
	).toMatchObject({
		source: id,
		sourcePath: [id],
		scope: "field",
		target: ["additionalFields", id],
	})
})

test("literal and qualified interpretations stay unresolved when they identify different registered fields", () => {
	const id = "billing_address.foo/reference"
	const literal = { id, location: "contact" as const, bindings: { other: ["additionalFields", id] } }
	const address = { id: "foo/reference", location: "address" as const, bindings: { billing: ["additionalFields", "foo/reference"] } }
	const data = normalize({ params: { [id]: "Required" } })
	expect(resolveCheckoutValidationIssues(data, [literal])[0]).toMatchObject({ target: ["additionalFields", id] })
	expect(resolveCheckoutValidationIssues(data, [address])[0]).toMatchObject({
		target: ["billingAddress", "additionalFields", "foo/reference"],
	})
	expect(resolveCheckoutValidationIssues(data, [literal, address])[0]).toMatchObject({
		source: id,
		sourcePath: [id],
		scope: "unresolved",
		target: null,
		message: "Required",
	})
	const explicit = normalize({ details: { billing_address: { code: "required", message: "Required", data: { key: "foo/reference" } } } })
	expect(resolveCheckoutValidationIssues(explicit, [literal, address])[0]).toMatchObject({
		scope: "field",
		target: ["billingAddress", "additionalFields", "foo/reference"],
	})
})

test("explicit SDK path segments and literal relative params preserve their identity", () => {
	const id = "billing_plugin/reference"
	const data = normalize({
		details: {
			billing_address: { message: "Tax ID required", data: { path: ["billingAddress", "taxId"] } },
			additional_fields: { message: "Reference required", data: { param: id } },
		},
	})
	expect(
		resolveCheckoutValidationIssues(data, [{ id, location: "order", bindings: { other: ["additionalFields", id] } }]).map(
			({ target }) => target,
		),
	).toEqual([
		["billingAddress", "taxId"],
		["additionalFields", id],
	])
})

test("root identity and nested data messages survive while unrelated payload values remain private", () => {
	const data = normalize({
		param: "shipping_address",
		errors: [{ code: "required", message: "Shipping required" }],
		ignored: "Not a validation message",
	})
	expect(data.issues).toEqual([
		{
			source: "shipping_address",
			sourcePath: ["shipping_address"],
			code: "required",
			message: "Shipping required",
			scope: "group",
			target: ["shippingAddress"],
		},
	])
	const nested = normalize({
		details: { billing_address: { message: "Billing failed", data: { code: "nested", message: "Nested failed" } } },
	})
	expect(nested.issues.map(({ message, code }) => [message, code])).toEqual([
		["Billing failed", "rest_invalid_param"],
		["Nested failed", "nested"],
	])
	const array = normalize({ errors: [{ code: "required", message: ["First", "Second"], data: { key: "order/note" } }] })
	expect(array.issues.map(({ source, message }) => [source, message])).toEqual([
		["order/note", "First"],
		["order/note", "Second"],
	])
})

test.each(["errors", "additional_errors"])("%s maps preserve known group and core identity", (container) => {
	expect(normalize({ [container]: { shippingAddress: { first_name: "Required" } } }).issues[0]).toMatchObject({
		source: "shippingAddress",
		sourcePath: ["shipping_address", "first_name"],
		target: ["shippingAddress", "firstName"],
		message: "Required",
	})
})
