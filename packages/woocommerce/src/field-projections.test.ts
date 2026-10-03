import { describe, expect, test } from "vitest"
import { BillingAdditionalFieldsSchema, billingAdditionalFieldValues } from "./additional-fields"
import { CartBillingAddress, UpdateCartInput } from "./cart/schema"
import { deserializeCartBillingAddress, serializeCartUpdateInput } from "./cart/utils"
import { ConfirmCheckoutInput, RetryCheckoutInput } from "./checkout/schema"
import { serializeCheckoutBillingAddress } from "./checkout/utils"
import { BillingFieldProjections, BillingNativeFields, deserializeBillingFields, resolveRegisteredFieldTarget } from "./field-projections"

const address = {
	firstName: "Ada",
	lastName: "Buyer",
	company: "",
	email: "ada@example.com",
	phone: "",
	address1: "1 Road",
	address2: "",
	city: "London",
	state: "",
	postcode: "SW1A 1AA",
	country: "GB",
	additionalFields: {},
}
const locations = { address: ["kizlo/tax-id", "qa/reference"], contact: ["qa/opt-in"], order: ["qa/message"] }

test("the registered projection governs native schemas, defaults, reads and wire writes", () => {
	expect(BillingFieldProjections.taxId).toMatchObject({ id: "kizlo/tax-id", location: "address", group: "billing" })
	expect(CartBillingAddress.shape.taxId).toBe(BillingNativeFields.taxId)
	expect(deserializeBillingFields({ "kizlo/tax-id": "GB-42" })).toEqual({ taxId: "GB-42" })
	for (const value of [undefined, false, null, 123]) expect(deserializeBillingFields({ "kizlo/tax-id": value })).toEqual({ taxId: "" })
	for (const taxId of ["GB-1", "GB-2", ""]) {
		const input = { billingAddress: { taxId, additionalFields: { "qa/reference": "", "qa/address-flag": false } } }
		const before = structuredClone(input)
		const wire = serializeCartUpdateInput(input)
		expect(wire.billing_address).toEqual({ "kizlo/tax-id": taxId, "qa/reference": "", "qa/address-flag": false })
		expect(deserializeCartBillingAddress(wire.billing_address as Parameters<typeof deserializeCartBillingAddress>[0]).taxId).toBe(taxId)
		expect(serializeCheckoutBillingAddress({ ...address, taxId })).toHaveProperty("kizlo/tax-id", taxId)
		expect(input).toEqual(before)
	}
	expect(UpdateCartInput.parse({ billingAddress: { city: "London" } })).toEqual({ billingAddress: { city: "London" } })
	expect(serializeCartUpdateInput({ billingAddress: { city: "London" } })).toEqual({ billing_address: { city: "London" } })
	expect(billingAdditionalFieldValues({ "kizlo/tax-id": "GB", "unknown/field": "future", "qa/address-flag": false })).toEqual({
		"unknown/field": "future",
		"qa/address-flag": false,
	})
})

describe.each(["different", "GB-42", undefined])("raw projected billing key %s", (raw) => {
	test("rejects duplicate or raw-only inputs through schemas and serializers without mutation", () => {
		const input = { billingAddress: { ...address, taxId: "GB-42", additionalFields: { "kizlo/tax-id": raw } } }
		const before = structuredClone(input)
		expect(UpdateCartInput.safeParse(input).success).toBe(false)
		expect(ConfirmCheckoutInput.safeParse({ ...input, paymentMethod: "bacs" }).success).toBe(false)
		expect(RetryCheckoutInput.safeParse({ ...input, paymentMethod: "bacs", key: "key", orderId: 1 }).success).toBe(false)
		expect(BillingAdditionalFieldsSchema.safeParse(input.billingAddress.additionalFields).success).toBe(false)
		expect(() => serializeCartUpdateInput(input as unknown as Parameters<typeof serializeCartUpdateInput>[0])).toThrow(
			"Use billingAddress.taxId",
		)
		expect(() =>
			serializeCheckoutBillingAddress(input.billingAddress as unknown as Parameters<typeof serializeCheckoutBillingAddress>[0]),
		).toThrow("Use billingAddress.taxId")
		expect(() =>
			serializeCartUpdateInput({ billingAddress: { additionalFields: input.billingAddress.additionalFields } } as unknown as Parameters<
				typeof serializeCartUpdateInput
			>[0]),
		).toThrow()
		expect(input).toEqual(before)
	})
})

test("metadata and error targets keep native identity beside the Woo-shaped conditional document", () => {
	expect(resolveRegisteredFieldTarget(locations, "kizlo/tax-id", "billing")).toEqual({
		id: "kizlo/tax-id",
		location: "address",
		group: "billing",
		path: ["billingAddress", "taxId"],
		wirePath: ["billing_address", "kizlo/tax-id"],
	})
	expect(resolveRegisteredFieldTarget(locations, "kizlo/tax-id", "billing", "customer")?.path).toEqual(["billing", "taxId"])
	expect(resolveRegisteredFieldTarget(locations, "qa/reference", "shipping")?.path).toEqual([
		"shippingAddress",
		"additionalFields",
		"qa/reference",
	])
	expect(resolveRegisteredFieldTarget(locations, "qa/opt-in")?.path).toEqual(["additionalFields", "qa/opt-in"])
	expect(resolveRegisteredFieldTarget(locations, "qa/message", "other", "customer")).toBeNull()
	for (const id of ["unknown/key", "billing_address", "kizlo/tax-id"]) expect(resolveRegisteredFieldTarget(locations, id)).toBeNull()
	expect(resolveRegisteredFieldTarget(locations, "kizlo/tax-id", "shipping")).toBeNull()
	expect(resolveRegisteredFieldTarget({ ...locations, contact: ["kizlo/tax-id"] }, "kizlo/tax-id", "billing")).toBeNull()
	const fields = serializeCartUpdateInput({ billingAddress: { taxId: "GB" } })
	expect(fields).toEqual({ billing_address: { "kizlo/tax-id": "GB" } })
	// Rule evaluation remains on Woo's registered identity, not the normalized native property.
	expect(fields.billing_address).not.toHaveProperty("taxId")
})
