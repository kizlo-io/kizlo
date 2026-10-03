import { expect, test } from "vitest"
import { AddressAdditionalFieldsSchema, additionalFieldValues, CheckoutAdditionalFieldsSchema } from "./additional-fields"

test("scalar structural guards retain false and clearing values without claiming enum validation", () => {
	const fields = { "qa/opt-in": false, "qa/message": "", "unknown/key": "future" }
	expect(CheckoutAdditionalFieldsSchema.parse(fields)).toEqual(fields)
	expect(AddressAdditionalFieldsSchema.safeParse([]).success).toBe(false)
	expect(AddressAdditionalFieldsSchema.safeParse(null).success).toBe(false)
	expect(AddressAdditionalFieldsSchema.safeParse({ "qa/reference": 123 }).success).toBe(false)
	// Generated enum typing is static; the live WooCommerce validates this submission.
	expect(CheckoutAdditionalFieldsSchema.safeParse({ "qa/slot": "evening" }).success).toBe(true)
	expect(additionalFieldValues({ ...fields, number: 1, nested: {}, omitted: undefined })).toEqual(fields)
	expect(additionalFieldValues([])).toEqual({})
})
