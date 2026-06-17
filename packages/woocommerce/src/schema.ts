import z from "zod/v4"

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
export type ShippingAddress = z.infer<typeof ShippingAddress>

export const BillingAddress = z.object({
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
	email: z.string(),
})
export type BillingAddress = z.infer<typeof BillingAddress>
