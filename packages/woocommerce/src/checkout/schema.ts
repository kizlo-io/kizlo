import { NumberLike } from "@kizlo/shared"
import z from "zod"
import {
	type CheckoutAdditionalFieldsInput,
	CheckoutAdditionalFieldsSchema,
	type CheckoutAdditionalFieldsSubmission,
	CheckoutAdditionalFieldsSubmissionSchema,
	type CheckoutAdditionalFields as RegisteredCheckoutAdditionalFields,
} from "../additional-fields"
import {
	Cart,
	CartBillingAddress,
	type CartBillingAddressInput,
	CartBillingAddressSubmission,
	CartShippingAddress,
	type CartShippingAddressInput,
	CartShippingAddressSubmission,
} from "../cart/schema"

export const CheckoutAdditionalFields: typeof CheckoutAdditionalFieldsSchema = CheckoutAdditionalFieldsSchema
export type CheckoutAdditionalFields = RegisteredCheckoutAdditionalFields

export const CheckoutExtensions = z.record(z.string(), z.unknown())
export type CheckoutExtensions = z.infer<typeof CheckoutExtensions>

export const CheckoutPaymentData = z.array(z.object({ key: z.string(), value: z.union([z.string(), z.boolean()]) }))
export type CheckoutPaymentData = z.infer<typeof CheckoutPaymentData>

// A frontend path the store redirects to after checkout. Relative-only: it must
// start with a single "/" so a scheme (`https:`) or a protocol-relative `//host`
// cannot smuggle an off-site origin past WooCommerce's redirect allow-list.
const RelativePath = z.string().refine((value) => /^\/(?![/\\])/.test(value), "must be a relative path starting with a single '/'")

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
	isPaid: z.boolean(),
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
export type Checkout = Omit<z.output<typeof Checkout>, "additionalFields" | "billingAddress" | "shippingAddress" | "cart"> & {
	additionalFields: RegisteredCheckoutAdditionalFields
	billingAddress: CartBillingAddress
	shippingAddress: CartShippingAddress
	cart: Cart | null
}

export const UpdateCheckoutInput = z.object({
	paymentMethod: z.string().optional(),
	customerNote: z.string().optional(),
	recalculateTotals: z.boolean().optional(),
	additionalFields: CheckoutAdditionalFields.optional(),
	extensions: CheckoutExtensions.optional(),
})
export type UpdateCheckoutInput = Omit<z.input<typeof UpdateCheckoutInput>, "additionalFields"> & {
	additionalFields?: CheckoutAdditionalFieldsInput
}

export const ConfirmCheckoutInput = z.object({
	billingAddress: CartBillingAddressSubmission,
	shippingAddress: CartShippingAddressSubmission.optional(),
	paymentMethod: z.string(),
	customerNote: z.string().optional(),
	createAccount: z.boolean().optional(),
	customerPassword: z.string().optional(),
	paymentData: CheckoutPaymentData.optional(),
	additionalFields: CheckoutAdditionalFieldsSubmissionSchema.optional(),
	extensions: CheckoutExtensions.optional(),
	successPath: RelativePath.optional(),
	cancelPath: RelativePath.optional(),
})
export type ConfirmCheckoutInput = Omit<z.input<typeof ConfirmCheckoutInput>, "additionalFields" | "billingAddress" | "shippingAddress"> & {
	additionalFields?: CheckoutAdditionalFieldsSubmission
	billingAddress: CartBillingAddressInput
	shippingAddress?: CartShippingAddressInput
}

export const RetryCheckoutInput = z.object({
	key: z.string(),
	orderId: NumberLike,
	paymentMethod: z.string(),
	billingEmail: z.email().optional(),
	billingAddress: CartBillingAddressSubmission,
	paymentData: CheckoutPaymentData.optional(),
	shippingAddress: CartShippingAddressSubmission.optional(),
	customerNote: z.string().optional(),
	additionalFields: CheckoutAdditionalFieldsSubmissionSchema.optional(),
	extensions: CheckoutExtensions.optional(),
	successPath: RelativePath.optional(),
	cancelPath: RelativePath.optional(),
})
export type RetryCheckoutInput = Omit<z.input<typeof RetryCheckoutInput>, "additionalFields" | "billingAddress" | "shippingAddress"> & {
	additionalFields?: CheckoutAdditionalFieldsSubmission
	billingAddress: CartBillingAddressInput
	shippingAddress?: CartShippingAddressInput
}
