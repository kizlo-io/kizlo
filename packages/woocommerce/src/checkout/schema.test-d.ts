import type { InferIntegrationProcedures, InferProcedureError, InferProcedureInput, ResultClient } from "kizlo"
import { expectTypeOf } from "vitest"
import type { Cart } from "../cart/schema"
import type { woocommerce } from "../index"
import type { ConfirmCheckoutInput, RetryCheckoutInput } from "./schema"

type Procedures = InferIntegrationProcedures<[ReturnType<typeof woocommerce>]>
type Confirm = Procedures["woocommerce"]["checkout"]["confirm"]
type Error = Extract<InferProcedureError<Confirm>, { code: "CHECKOUT_TOTAL_MISMATCH" }>
type Client = ResultClient<Procedures>
type Result = Awaited<ReturnType<Client["woocommerce"]["checkout"]["confirm"]>>

expectTypeOf<ConfirmCheckoutInput["expectedTotal"]>().toEqualTypeOf<string | undefined>()
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
