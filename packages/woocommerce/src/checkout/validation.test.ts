import { expect, test } from "vitest"
import { CheckoutValidationData, checkoutValidationData } from "./validation"

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
])("normalizes core/native source %s without a consumer table", (source, target) => {
	const data = normalize({ params: { [source]: "Required" } })
	expect(data.issues).toEqual([
		{
			source,
			sourcePath: expect.any(Array),
			code: "rest_invalid_param",
			message: "Required",
			registeredFields: [],
			scope: "field",
			target,
		},
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

test("extraction supplies references in all SDK buckets without loaded definitions", () => {
	const data = normalize({
		details: {
			billing_address: { "plug/a.b[0]": "Billing required" },
			shipping_address: { "plug/a.b[0]": "Shipping required" },
			additional_fields: { "contact/opt-in": "Consent required", "order/note": "Note required" },
		},
	})
	expect(data.issues.map(({ scope, target, registeredFields }) => ({ scope, target, registeredFields }))).toEqual([
		{ scope: "unresolved", target: null, registeredFields: [{ id: "plug/a.b[0]", bucket: "billingAddress" }] },
		{ scope: "unresolved", target: null, registeredFields: [{ id: "plug/a.b[0]", bucket: "shippingAddress" }] },
		{ scope: "unresolved", target: null, registeredFields: [{ id: "contact/opt-in", bucket: "additionalFields" }] },
		{ scope: "unresolved", target: null, registeredFields: [{ id: "order/note", bucket: "additionalFields" }] },
	])
	expect(CheckoutValidationData.parse(data)).toEqual(data)
})

test.each(["plug/a.b[0]", "kizlo/tax-id", "unknown/id", "contact/opt-in", "order/note", "billing_plugin/reference"])(
	"bare identity %s retains an unspecified bucket without inventing a target",
	(id) => {
		expect(normalize({ params: { [id]: "Required" } }).issues[0]).toMatchObject({
			scope: "unresolved",
			target: null,
			registeredFields: [{ id, bucket: null }],
			message: "Required",
		})
	},
)

test("unknown address fields retain context; excluded native fields remain unresolved", () => {
	expect(normalize({ details: { billing_address: { "unknown/id": "Required" } } }).issues[0]).toMatchObject({
		scope: "unresolved",
		target: null,
		registeredFields: [{ id: "unknown/id", bucket: "billingAddress" }],
	})
	expect(normalize({ details: { shipping_address: { "kizlo/tax-id": "Required" } } }).issues[0]).toMatchObject({
		scope: "unresolved",
		target: null,
		registeredFields: [],
	})
})

test.each([undefined, null, false, 42, "invalid", [], { params: null, details: false }, { details: { broken: { message: 42 } } }])(
	"keeps a summary for malformed or missing data %j",
	(data) => {
		expect(normalize(data).issues).toEqual([
			{
				source: null,
				sourcePath: [],
				code: "rest_invalid_param",
				message: "Invalid checkout",
				scope: "unresolved",
				target: null,
				registeredFields: [],
			},
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

test("WooCommerce 11 field-key details normalize each bucket, including additional_errors", () => {
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
	expect(data.issues.map(({ target, scope, message, registeredFields }) => ({ target, scope, message, registeredFields }))).toEqual([
		{ scope: "field", target: ["billingAddress", "taxId"], message: "Required", registeredFields: [] },
		{
			scope: "unresolved",
			target: null,
			message: "Invalid reference",
			registeredFields: [{ id: "plug/a.b[0]", bucket: "billingAddress" }],
		},
		{
			scope: "unresolved",
			target: null,
			message: "Consent required",
			registeredFields: [{ id: "contact/opt-in", bucket: "additionalFields" }],
		},
		{ scope: "unresolved", target: null, message: "Note required", registeredFields: [{ id: "order/note", bucket: "additionalFields" }] },
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
			registeredFields: [],
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

test.each([
	"billing_address.foo/reference",
	"billingAddress[foo/reference]",
	"additional_fields[foo/reference]",
	"billing_address.foo%2Fbar",
])("qualified-looking source %s preserves literal and qualified alternatives", (id) => {
	const issue = normalize({ params: { [id]: "Required" } }).issues[0]
	expect(issue).toMatchObject({ scope: "unresolved", target: null, source: id, sourcePath: [id] })
	expect(issue?.registeredFields).toEqual([
		{ id, bucket: null },
		{ id: id.includes("%") ? "foo%2Fbar" : "foo/reference", bucket: id.startsWith("additional") ? "additionalFields" : "billingAddress" },
	])
})

test.each(["plugin/a.b[0]", 'plugin/a["quote"]', "plugin/a%2Fb", "plugin/a%252Fb", "billing_address.foo/reference"])(
	"explicit structured key %s is literal and takes precedence",
	(id) => {
		const issue = normalize({
			details: {
				billing_address: {
					message: "Required",
					data: { key: id, group: "shipping", param: "billing_address[other/id]" },
				},
			},
		}).issues[0]
		expect(issue).toMatchObject({ scope: "unresolved", target: null, registeredFields: [{ id, bucket: "shippingAddress" }] })
	},
)

test("explicit paths, relative params and parent buckets preserve their independent identity", () => {
	const data = normalize({
		details: {
			billing_address: { message: "Tax ID required", data: { path: ["billingAddress", "taxId"] } },
			additional_fields: { message: "Reference required", data: { param: "billing_plugin/reference" } },
			shipping_address: { "billing_address.foo/reference": "Shipping reference" },
		},
	})
	expect(data.issues[0]).toMatchObject({ scope: "field", target: ["billingAddress", "taxId"] })
	expect(data.issues[1]?.registeredFields).toEqual([{ id: "billing_plugin/reference", bucket: "additionalFields" }])
	expect(data.issues[2]?.registeredFields).toEqual([{ id: "billing_address.foo/reference", bucket: "shippingAddress" }])
})

test("explicit field identity without context stays literal and unspecified", () => {
	expect(
		normalize({ errors: [{ message: "Required", data: { key: "billing_address.foo/reference", location: "address" } }] }).issues[0],
	).toMatchObject({ registeredFields: [{ id: "billing_address.foo/reference", bucket: null }], scope: "unresolved", target: null })
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
			registeredFields: [],
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

test.each([
	[["billingAddress", "plugin/a.b[0]"], { id: "plugin/a.b[0]", bucket: "billingAddress" }],
	[["billingAddress", "additionalFields", "plugin/a.b[0]"], { id: "plugin/a.b[0]", bucket: "billingAddress" }],
	[["additionalFields", "billing_address.first_name"], { id: "billing_address.first_name", bucket: "additionalFields" }],
	[["billing_address.first_name"], { id: "billing_address.first_name", bucket: null }],
])("explicit literal path %j is normalized without speculative parsing", (path, reference) => {
	expect(normalize({ errors: [{ message: "Required", data: { path } }] }).issues[0]).toMatchObject({
		registeredFields: [reference],
		scope: "unresolved",
		target: null,
	})
})

test("ambiguous native qualified syntax retains both identities", () => {
	expect(normalize({ params: { "billing_address[kizlo/tax-id]": "Required" } }).issues[0]).toMatchObject({
		registeredFields: [
			{ id: "billing_address[kizlo/tax-id]", bucket: null },
			{ id: "kizlo/tax-id", bucket: "billingAddress" },
		],
		scope: "unresolved",
		target: null,
	})
})

test.each(["contact", "order"])("explicit %s location supplies the shared additional-fields bucket", (location) => {
	expect(normalize({ errors: [{ message: "Required", data: { key: "plugin/reference", location } }] }).issues[0]).toMatchObject({
		registeredFields: [{ id: "plugin/reference", bucket: "additionalFields" }],
		scope: "unresolved",
		target: null,
	})
})

test("a nested error's new parameter does not inherit its parent's explicit literal identity", () => {
	const data = normalize({
		errors: [
			{
				message: "Parent",
				data: { key: "plugin/parent" },
				additional_errors: [{ message: "Child", data: { param: "billing_address.foo/reference" } }],
			},
		],
	})
	expect(data.issues.map(({ registeredFields }) => registeredFields)).toEqual([
		[{ id: "plugin/parent", bucket: null }],
		[
			{ id: "billing_address.foo/reference", bucket: null },
			{ id: "foo/reference", bucket: "billingAddress" },
		],
	])
})

test.each(["details", "params"])("%s messages retain their parent's explicit literal identity", (container) => {
	const id = "billing_address.foo/reference"
	const data = normalize({ errors: [{ data: { path: [id] }, [container]: ["First", "Second"] }] })
	expect(data.issues.map(({ message, registeredFields }) => ({ message, registeredFields }))).toEqual([
		{ message: "First", registeredFields: [{ id, bucket: null }] },
		{ message: "Second", registeredFields: [{ id, bucket: null }] },
	])
})

test("nested detail messages retain a complete explicit SDK address path", () => {
	expect(
		normalize({ errors: [{ data: { path: ["shippingAddress", "additionalFields", "plugin/reference"] }, details: "Required" }] }).issues[0],
	).toMatchObject({ registeredFields: [{ id: "plugin/reference", bucket: "shippingAddress" }], message: "Required" })
})

test("a named detail entry's new parameter establishes its own ambiguous identity", () => {
	const data = normalize({
		errors: [
			{
				data: { path: ["billing_address.parent/reference"] },
				details: { child: { message: "Required", data: { param: "shipping_address.foo/reference" } } },
			},
		],
	})
	expect(data.issues[0]).toMatchObject({
		registeredFields: [
			{ id: "shipping_address.foo/reference", bucket: null },
			{ id: "foo/reference", bucket: "shippingAddress" },
		],
	})
})

test.each([
	["billing", "billingAddress"],
	["shipping", "shippingAddress"],
	["other", "additionalFields"],
] as const)("explicit %s context applies to relative parameter and path identities", (group, bucket) => {
	for (const identity of [{ param: "plugin/reference" }, { path: ["plugin/reference"] }]) {
		expect(normalize({ errors: [{ message: "Required", data: { ...identity, group } }] }).issues[0]).toMatchObject({
			registeredFields: [{ id: "plugin/reference", bucket }],
		})
	}
})

test.each(["contact", "order"])("root %s context applies to a relative parameter", (location) => {
	expect(normalize({ message: "Required", param: "plugin/reference", location }).issues[0]).toMatchObject({
		registeredFields: [{ id: "plugin/reference", bucket: "additionalFields" }],
	})
})

test("explicit context keeps qualified-looking relative identities literal", () => {
	expect(
		normalize({ errors: [{ message: "Required", data: { param: "billing_address.foo/reference", group: "shipping" } }] }).issues[0],
	).toMatchObject({
		registeredFields: [{ id: "billing_address.foo/reference", bucket: "shippingAddress" }],
	})
})
