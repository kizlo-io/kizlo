import { NumberLike } from "@kizlo/shared"
import z from "zod"
import { Cart, CartBillingAddress, CartShippingAddress } from "../cart/schema"

export const CheckoutAdditionalFields = z.record(z.string(), z.union([z.string(), z.boolean()]))
export type CheckoutAdditionalFields = z.infer<typeof CheckoutAdditionalFields>

export const CheckoutExtensions = z.record(z.string(), z.unknown())
export type CheckoutExtensions = z.infer<typeof CheckoutExtensions>

export const CheckoutPaymentData = z.array(z.object({ key: z.string(), value: z.union([z.string(), z.boolean()]) }))
export type CheckoutPaymentData = z.infer<typeof CheckoutPaymentData>

export const CheckoutPaymentResult = z.object({
	status: z.string(),
	details: z.array(z.object({ key: z.string(), value: z.string() })),
	redirectUrl: z.string().nullable(),
})
export type CheckoutPaymentResult = z.infer<typeof CheckoutPaymentResult>

export const Checkout = z.object({
	orderId: z.number().nullable(),
	orderNumber: z.string().nullable(),
	orderKey: z.string().nullable(),
	status: z.string(),
	customerId: z.number().nullable(),
	customerNote: z.string(),
	billingAddress: CartBillingAddress,
	shippingAddress: CartShippingAddress,
	paymentMethod: z.string().nullable(),
	paymentResult: CheckoutPaymentResult.nullable(),
	additionalFields: CheckoutAdditionalFields,
	cart: Cart.nullable(),
	extensions: CheckoutExtensions,
})
export type Checkout = z.output<typeof Checkout>

export const UpdateCheckoutInput = z.object({
	paymentMethod: z.string().optional(),
	customerNote: z.string().optional(),
	recalculateTotals: z.boolean().optional(),
	additionalFields: CheckoutAdditionalFields.optional(),
	extensions: CheckoutExtensions.optional(),
})
export type UpdateCheckoutInput = z.input<typeof UpdateCheckoutInput>

export const ConfirmCheckoutInput = z.object({
	billingAddress: CartBillingAddress,
	shippingAddress: CartShippingAddress.optional(),
	paymentMethod: z.string(),
	customerNote: z.string().optional(),
	createAccount: z.boolean().optional(),
	customerPassword: z.string().optional(),
	paymentData: CheckoutPaymentData.optional(),
	additionalFields: CheckoutAdditionalFields.optional(),
	extensions: CheckoutExtensions.optional(),
})
export type ConfirmCheckoutInput = z.input<typeof ConfirmCheckoutInput>

export const RetryCheckoutInput = z.object({
	key: z.string(),
	orderId: NumberLike,
	paymentMethod: z.string(),
	billingEmail: z.email().optional(),
	billingAddress: CartBillingAddress,
	paymentData: CheckoutPaymentData.optional(),
	shippingAddress: CartShippingAddress.optional(),
	customerNote: z.string().optional(),
	additionalFields: CheckoutAdditionalFields.optional(),
	extensions: CheckoutExtensions.optional(),
})
export type RetryCheckoutInput = z.input<typeof RetryCheckoutInput>
