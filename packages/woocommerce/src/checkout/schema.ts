import { NumberLike } from "@kizlo/shared"
import z from "zod"
import { Cart } from "../cart/schema"
import { BillingAddress, ShippingAddress } from "../schema"

export const CheckoutAdditionalFields = z.record(z.string(), z.union([z.string(), z.boolean()]))
export const CheckoutPaymentData = z.array(z.object({ key: z.string(), value: z.union([z.string(), z.boolean()]) }))

export const Checkout = z.object({
	cart: Cart.nullable(),
	billingAddress: BillingAddress,
	shippingAddress: ShippingAddress,
	paymentMethod: z.string(),
	customerNote: z.string(),
	additionalFields: CheckoutAdditionalFields,
	paymentResult: z
		.object({
			status: z.enum(["success", "pending", "failure", "error"]),
			data: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
			redirectUrl: z.string(),
		})
		.nullable(),
})
export type Checkout = z.output<typeof Checkout>

export const UpdateCheckoutInput = z.object({
	paymentMethod: z.string().optional(),
	customerNote: z.string().optional(),
	recalculateTotals: z.boolean().optional(),
	additionalFields: CheckoutAdditionalFields.optional(),
})
export type UpdateCheckoutInput = z.input<typeof UpdateCheckoutInput>

export const ConfirmCheckoutInput = z.object({
	customerPassword: z.string().optional(),
	paymentData: CheckoutPaymentData.optional(),
})
export type ConfirmCheckoutInput = z.input<typeof ConfirmCheckoutInput>

export const RetryCheckoutInput = z.object({
	key: z.string(),
	orderId: NumberLike,
	paymentMethod: z.string(),
	billingEmail: z.email().optional(),
	billingAddress: BillingAddress.optional(),
	paymentData: CheckoutPaymentData.optional(),
	shippingAddress: ShippingAddress.optional(),
})
export type RetryCheckoutInput = z.input<typeof RetryCheckoutInput>
