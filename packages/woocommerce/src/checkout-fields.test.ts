import { expect, test } from "vitest"
import { serializeCartUpdateInput } from "./cart/utils"
import {
	CoreAddressFieldKeys,
	checkoutFieldAddress,
	deserializeCoreAddress,
	resolveCheckoutFieldTarget,
	serializeCoreAddress,
} from "./checkout-fields"
import { resolveRegisteredFieldTarget } from "./field-projections"

const locations = {
	address: [...Object.keys(CoreAddressFieldKeys), "kizlo/tax-id", "plug/a.b[0]"],
	contact: ["email", "plug/flag"],
	order: ["plug/note"],
}

test("every core ID agrees with SDK address hydration and partial serialization", () => {
	for (const [key, property] of Object.entries(CoreAddressFieldKeys)) {
		const input = { [property]: "value" }
		expect(deserializeCoreAddress({ [key]: "value" })[property as keyof ReturnType<typeof deserializeCoreAddress>]).toBe("value")
		expect(serializeCoreAddress(input)).toEqual({ [key]: "value" })
		for (const group of ["billing", "shipping"] as const)
			expect(resolveCheckoutFieldTarget(locations, key, group)?.path).toEqual([`${group}Address`, property])
	}
	expect(resolveCheckoutFieldTarget(locations, "email")?.path).toEqual(["billingAddress", "email"])
	expect(serializeCartUpdateInput({ billingAddress: { firstName: "Ada", address1: "1 Road" } })).toEqual({
		billing_address: { first_name: "Ada", address_1: "1 Road" },
	})
})

test("registration location, group and literal IDs survive alongside native projections", () => {
	expect(resolveCheckoutFieldTarget(locations, "kizlo/tax-id", "billing")?.path).toEqual(["billingAddress", "taxId"])
	for (const group of ["billing", "shipping"] as const)
		expect(resolveCheckoutFieldTarget(locations, "plug/a.b[0]", group)?.path).toEqual([
			`${group}Address`,
			"additionalFields",
			"plug/a.b[0]",
		])
	for (const [id, location] of [
		["plug/flag", "contact"],
		["plug/note", "order"],
	])
		expect(resolveCheckoutFieldTarget(locations, id as string)).toMatchObject({ location, group: "other", path: ["additionalFields", id] })
	expect(resolveCheckoutFieldTarget(locations, "kizlo/tax-id", "shipping")?.path).toEqual([
		"shippingAddress",
		"additionalFields",
		"kizlo/tax-id",
	])
	// Naming the hidden registered metadata never enables shipping persistence/error assignment.
	expect(resolveRegisteredFieldTarget(locations, "kizlo/tax-id", "shipping")).toBeNull()
	expect(serializeCartUpdateInput({ shippingAddress: { additionalFields: { "kizlo/tax-id": "copy" } } }).shipping_address).toEqual({})
	for (const key of ["unknown/key", "firstName", "taxId", "billing_address"])
		expect(resolveCheckoutFieldTarget(locations, key, "billing")).toBeNull()
	expect(resolveCheckoutFieldTarget({ ...locations, order: ["kizlo/tax-id"] }, "kizlo/tax-id", "billing")).toBeNull()
	expect(resolveCheckoutFieldTarget(locations, "email", "shipping")).toBeNull()
	expect(resolveCheckoutFieldTarget(locations, "first_name")).toBeNull()
})

test("reverse documents preserve false, empty and punctuation IDs without mutating snapshots", () => {
	const address = { firstName: "Ada", email: "", taxId: "GB-42", additionalFields: { "plug/a.b[0]": "", "plug/flag": false } }
	const before = structuredClone(address)
	expect(checkoutFieldAddress(address, "billing")).toEqual({
		first_name: "Ada",
		email: "",
		"kizlo/tax-id": "GB-42",
		"plug/a.b[0]": "",
		"plug/flag": false,
	})
	expect(checkoutFieldAddress({ firstName: "Ada", additionalFields: {} }, "shipping")).toEqual({ first_name: "Ada" })
	expect(checkoutFieldAddress({}, "billing")).toEqual({})
	expect(checkoutFieldAddress({ country: "GB", additionalFields: { email: "extra", first_name: "extra" } }, "shipping")).toEqual({
		country: "GB",
	})
	expect(address).toEqual(before)
})
