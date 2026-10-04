import type { InferIntegrationProcedures, InferProcedureData, InferProcedureInput, WP_Schema } from "kizlo"
import { expectTypeOf } from "vitest"
import type { AddressAdditionalFields, BillingAdditionalFields } from "./additional-fields"
import type { Cart, UpdateCartInput } from "./cart/schema"
import type { Checkout, ConfirmCheckoutInput, RetryCheckoutInput, UpdateCheckoutInput } from "./checkout/schema"
import type { Customer } from "./customer/schema"
import type { woocommerce } from "./index"
import type { Order } from "./order/schema"
import type { BillingAddress, ShippingAddress } from "./schema"

type Procedures = InferIntegrationProcedures<[ReturnType<typeof woocommerce>]>["woocommerce"]
expectTypeOf<Cart["billingAddress"]["additionalFields"]["qa/reference"]>().toEqualTypeOf<string | undefined>()
expectTypeOf<Cart["shippingAddress"]["additionalFields"]["qa/address-flag"]>().toEqualTypeOf<boolean | undefined>()
expectTypeOf<Checkout["additionalFields"]["qa/opt-in"]>().toEqualTypeOf<boolean | undefined>()
expectTypeOf<Order["additionalFields"]["qa/slot"]>().toEqualTypeOf<"" | "morning" | "afternoon" | undefined>()
expectTypeOf<Customer["billing"]["additionalFields"]["qa/reference"]>().toEqualTypeOf<string | undefined>()
expectTypeOf<Customer["shipping"]["additionalFields"]["qa/address-flag"]>().toEqualTypeOf<boolean | undefined>()
expectTypeOf<InferProcedureData<Procedures["customers"]["get"]>["billing"]["additionalFields"]["qa/reference"]>().toEqualTypeOf<
	string | undefined
>()
expectTypeOf<BillingAddress["additionalFields"]>().toEqualTypeOf<BillingAdditionalFields | undefined>()
expectTypeOf<ShippingAddress["additionalFields"]>().toEqualTypeOf<AddressAdditionalFields | undefined>()
expectTypeOf<Customer["additionalFields"]["qa/opt-in"]>().toEqualTypeOf<boolean | undefined>()
expectTypeOf<WP_Schema<"woocommerce.additional-fields.address.read">["kizlo/tax-id"]>().toEqualTypeOf<string | undefined>()
expectTypeOf<InferProcedureData<Procedures["checkout"]["get"]>["additionalFields"]["qa/opt-in"]>().toEqualTypeOf<boolean | undefined>()
expectTypeOf<NonNullable<InferProcedureInput<Procedures["checkout"]["confirm"]>["body"]["additionalFields"]>["qa/opt-in"]>().toEqualTypeOf<
	boolean | undefined
>()
expectTypeOf<NonNullable<InferProcedureInput<Procedures["checkout"]["retry"]>["body"]["additionalFields"]>["qa/slot"]>().toEqualTypeOf<
	"" | "morning" | "afternoon" | undefined
>()

const address: UpdateCartInput = { shippingAddress: { additionalFields: { "qa/reference": "", "qa/address-flag": false } } }
const checkout: UpdateCheckoutInput = { additionalFields: { "qa/opt-in": false, "qa/slot": "morning" } }
// @ts-expect-error contact keys do not belong in address literal inputs
const contactInAddress: UpdateCartInput = { shippingAddress: { additionalFields: { "qa/opt-in": false } } }
// @ts-expect-error address keys do not belong in checkout literal inputs
const addressInCheckout: UpdateCheckoutInput = { additionalFields: { "qa/reference": "BILL" } }
// @ts-expect-error checkbox assignments must be boolean
const wrongBoolean: UpdateCheckoutInput = { additionalFields: { "qa/opt-in": "false" } }
// @ts-expect-error select assignments must use an official option or optional empty value
const wrongSelect: ConfirmCheckoutInput["additionalFields"] = { "qa/slot": "evening" }
// @ts-expect-error retry retains checkbox types
const wrongRetry: RetryCheckoutInput["additionalFields"] = { "qa/opt-in": "true" }
void [address, checkout, contactInAddress, addressInCheckout, wrongBoolean, wrongSelect, wrongRetry]

expectTypeOf<Cart["billingAddress"]["taxId"]>().toEqualTypeOf<string>()
expectTypeOf<Cart["billingAddress"]["additionalFields"]["kizlo/tax-id"]>().toEqualTypeOf<undefined>()
expectTypeOf<Checkout["billingAddress"]["additionalFields"]["kizlo/tax-id"]>().toEqualTypeOf<undefined>()
expectTypeOf<Order["billingAddress"]["additionalFields"]["kizlo/tax-id"]>().toEqualTypeOf<undefined>()
expectTypeOf<Customer["billing"]["additionalFields"]["kizlo/tax-id"]>().toEqualTypeOf<undefined>()
const native: UpdateCartInput = { billingAddress: { taxId: "", additionalFields: { "qa/address-flag": false } } }
// @ts-expect-error the native projection is the only billing input
const duplicate: UpdateCartInput = { billingAddress: { taxId: "GB", additionalFields: { "kizlo/tax-id": "GB" } } }
// @ts-expect-error confirm must not expose two independently writable tax values
const duplicateConfirm: ConfirmCheckoutInput["billingAddress"]["additionalFields"] = { "kizlo/tax-id": "GB" }
// @ts-expect-error retry uses the same billing projection
const duplicateRetry: RetryCheckoutInput["billingAddress"]["additionalFields"] = { "kizlo/tax-id": "GB" }
void [native, duplicate, duplicateConfirm, duplicateRetry]
