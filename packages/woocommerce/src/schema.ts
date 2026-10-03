import z from "zod/v4"
import {
	type AddressAdditionalFields,
	AddressAdditionalFieldsSchema,
	type BillingAdditionalFields,
	BillingAdditionalFieldsSchema,
} from "./additional-fields"
import { BillingNativeFields } from "./field-projections"

export const Totals = z.object({
	discountTotal: z.number(),
	discountTaxTotal: z.number(),
	shippingTotal: z.number(),
	shippingTaxTotal: z.number(),
	feeTotal: z.number(),
	feeTaxTotal: z.number(),
	taxTotal: z.number(),
	total: z.number(),
})

export const ItemTotals = z.object({
	unitPrice: z.number(),
	grossAmount: z.number(),
	discountAmount: z.number(),
	discountTaxAmount: z.number(),
	netAmount: z.number(),
	taxAmount: z.number(),
	total: z.number(),
})

export const ShippingAddress = z.object({
	additionalFields: AddressAdditionalFieldsSchema.optional(),
	firstName: z.string(),
	lastName: z.string(),
	phone: z.string(),
	company: z.string().optional(),
	address1: z.string(),
	address2: z.string().optional(),
	city: z.string(),
	postcode: z.string(),
	state: z.string(),
	country: z.string(),
})
export type ShippingAddress = Omit<z.infer<typeof ShippingAddress>, "additionalFields"> & { additionalFields?: AddressAdditionalFields }

export const BillingAddress = ShippingAddress.extend({
	email: z.string(),
	...BillingNativeFields,
	additionalFields: BillingAdditionalFieldsSchema.optional(),
})
export type BillingAddress = Omit<z.infer<typeof BillingAddress>, "additionalFields"> & { additionalFields?: BillingAdditionalFields }
