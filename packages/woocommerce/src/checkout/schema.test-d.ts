import type { InferIntegrationProcedures, InferProcedureError, InferProcedureInput, ResultClient } from "kizlo"
import { expectTypeOf } from "vitest"
import type { Cart } from "../cart/schema"
import type { woocommerce } from "../index"
import type {
	Checkout,
	CheckoutBillingAddressInput,
	CheckoutShippingAddressInput,
	ConfirmCheckoutInput,
	RetryCheckoutInput,
} from "./schema"

type Procedures = InferIntegrationProcedures<[ReturnType<typeof woocommerce>]>
type Confirm = Procedures["woocommerce"]["checkout"]["confirm"]
type Error = Extract<InferProcedureError<Confirm>, { code: "CHECKOUT_TOTAL_MISMATCH" }>
type Client = ResultClient<Procedures>
type Result = Awaited<ReturnType<Client["woocommerce"]["checkout"]["confirm"]>>

expectTypeOf<ConfirmCheckoutInput["expectedTotal"]>().toEqualTypeOf<string | undefined>()
expectTypeOf<Checkout>().not.toHaveProperty("cart")
declare const checkout: Checkout
// @ts-expect-error Cart is a separate resource.
checkout.cart
expectTypeOf<InferProcedureInput<Confirm>["body"]["expectedTotal"]>().toEqualTypeOf<string | undefined>()
expectTypeOf<Error["status"]>().toEqualTypeOf<number>()
expectTypeOf<Error["data"]["expectedTotal"]>().toEqualTypeOf<string | undefined>()
expectTypeOf<Error["data"]["actualTotal"]>().toEqualTypeOf<string | undefined>()
expectTypeOf<Error["data"]["cart"]>().toMatchTypeOf<Cart | null>()
expectTypeOf<Extract<NonNullable<Result["error"]>, { code: "CHECKOUT_TOTAL_MISMATCH" }>>().toEqualTypeOf<Error>()

const valid: ConfirmCheckoutInput["expectedTotal"] = "0"
// @ts-expect-error The transport accepts minor-unit strings, never numbers.
const numeric: ConfirmCheckoutInput["expectedTotal"] = 1250
// @ts-expect-error Order-payment retry has a separate protocol.
const retry: RetryCheckoutInput["expectedTotal"] = "1250"
void [valid, numeric, retry]

const billing: CheckoutBillingAddressInput = { additionalFields: {} }
const shipping: CheckoutShippingAddressInput = { city: "London", additionalFields: {} }
const partialConfirm: ConfirmCheckoutInput = { billingAddress: billing, shippingAddress: shipping, paymentMethod: "bacs" }
const partialRetry: RetryCheckoutInput = { billingAddress: billing, paymentMethod: "bacs", orderId: 42, key: "key" }
const inferredConfirm: InferProcedureInput<Confirm>["body"] = partialConfirm
const inferredRetry: InferProcedureInput<Procedures["woocommerce"]["checkout"]["retry"]>["body"] = partialRetry
expectTypeOf<ConfirmCheckoutInput["billingAddress"]["taxId"]>().toEqualTypeOf<string | undefined>()
expectTypeOf<ConfirmCheckoutInput["billingAddress"]["email"]>().toEqualTypeOf<string | undefined>()
// @ts-expect-error billing remains required
const missingBilling: ConfirmCheckoutInput = { paymentMethod: "bacs" }
// @ts-expect-error supplied billing requires the registered submission container
const missingFields: CheckoutBillingAddressInput = { city: "London" }
// @ts-expect-error supplied shipping requires the registered submission container
const missingShippingFields: CheckoutShippingAddressInput = { city: "London" }
void [billing, shipping, partialConfirm, partialRetry, inferredConfirm, inferredRetry, missingBilling, missingFields, missingShippingFields]
