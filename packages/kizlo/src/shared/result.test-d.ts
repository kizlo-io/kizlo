import { describe, expectTypeOf, it } from "vitest"
import z from "zod/v4"
import type { ActiveKizloClient } from "../client"
import { defineErrorMap } from "./error"
import { createProcedure } from "./procedure"
import type {
	InferClientData,
	InferClientError,
	InferClientInput,
	InferClientResult,
	InferProcedureData,
	InferProcedureError,
	InferProcedureInput,
	InferProcedureResult,
	ResultClient,
} from "./result"

// ====================================================
// A fixture tree stands in for a generated contract, so the client-level helpers are
// asserted against the same `ResultClient` leaves a project compiles against.
// ====================================================

const CART_ERRORS = defineErrorMap({
	CART_ITEM_EXISTS: { data: z.object({ itemKey: z.string() }) },
	CART_EMPTY: {},
})

const add = createProcedure(
	{
		scope: "remote",
		input: z.object({ productId: z.number(), quantity: z.number() }),
		output: z.object({ itemKey: z.string(), total: z.number() }),
		errors: CART_ERRORS,
	},
	async () => ({ itemKey: "key", total: 1 }),
)

const clear = createProcedure({ scope: "remote", output: z.object({ cleared: z.boolean() }) }, async () => ({ cleared: true }))

type Client = ResultClient<{ cart: { add: typeof add; clear: typeof clear } }>
type AddMethod = Client["cart"]["add"]
type ClearMethod = Client["cart"]["clear"]

describe("InferClientInput", () => {
	it("yields the procedure's input from the method's call signature", () => {
		expectTypeOf<InferClientInput<AddMethod>>().toEqualTypeOf<{ productId: number; quantity: number }>()
	})

	it("widens with `undefined` where the method's argument is optional", () => {
		expectTypeOf<InferClientInput<ClearMethod>>().toEqualTypeOf<InferProcedureInput<typeof clear> | undefined>()
	})
})

describe("InferClientData", () => {
	it("yields the procedure's output from the success branch", () => {
		expectTypeOf<InferClientData<AddMethod>>().toEqualTypeOf<{ itemKey: string; total: number }>()
		expectTypeOf<InferClientData<AddMethod>>().toEqualTypeOf<InferProcedureData<typeof add>>()
	})
})

describe("InferClientError", () => {
	type AddError = InferClientError<AddMethod>

	it("carries the declared codes alongside the merged common codes", () => {
		expectTypeOf<"CART_ITEM_EXISTS">().toMatchTypeOf<AddError["code"]>()
		expectTypeOf<"CART_EMPTY">().toMatchTypeOf<AddError["code"]>()
		expectTypeOf<"NOT_FOUND">().toMatchTypeOf<AddError["code"]>()
		expectTypeOf<"INTERNAL_SERVER_ERROR">().toMatchTypeOf<AddError["code"]>()
		expectTypeOf<AddError>().toEqualTypeOf<InferProcedureError<typeof add>>()
	})

	it("narrows `data` per code", () => {
		expectTypeOf<Extract<AddError, { code: "CART_ITEM_EXISTS" }>["data"]>().toEqualTypeOf<{ itemKey: string }>()
		expectTypeOf<Extract<AddError, { code: "CART_EMPTY" }>["data"]>().toEqualTypeOf<never>()
	})
})

describe("InferClientResult", () => {
	it("yields both wrapped branches, discriminated by `success`", () => {
		type AddResult = InferClientResult<AddMethod>

		expectTypeOf<AddResult>().toEqualTypeOf<InferProcedureResult<typeof add>>()
		expectTypeOf<Extract<AddResult, { success: true }>>().toEqualTypeOf<{
			data: { itemKey: string; total: number }
			error: null
			success: true
		}>()
		expectTypeOf<Extract<AddResult, { success: false }>["data"]>().toEqualTypeOf<undefined>()
		expectTypeOf<Extract<AddResult, { success: false }>["error"]>().toEqualTypeOf<InferClientError<AddMethod>>()
	})
})

describe("a registered KizloProcedureRegistry", () => {
	// `src/kizlo.test-d.ts` registers a contract for this whole typecheck program, so this is a
	// client method exactly as a consuming project holds it, with no reach back into the tree.
	type SubmitComment = ActiveKizloClient["comments"]["submit"]

	it("recovers input, data and errors from the client method alone", () => {
		expectTypeOf<InferClientInput<SubmitComment>>().not.toBeAny()
		expectTypeOf<InferClientData<SubmitComment>>().not.toBeAny()
		expectTypeOf<"COMMENT_CLOSED">().toMatchTypeOf<InferClientError<SubmitComment>["code"]>()
		expectTypeOf<"NOT_FOUND">().toMatchTypeOf<InferClientError<SubmitComment>["code"]>()
	})
})

describe("a type that is not a client method", () => {
	// Every type is assignable to `never`, so an unresolved method would otherwise match the
	// `{ data: infer TData }` branch and infer `unknown`, turning a missing procedure into a loose
	// type instead of a missing one. `src/wordpress/types.ts` guards its own helpers the same way.
	it("collapses to `never` rather than widening to `unknown`", () => {
		expectTypeOf<InferClientData<never>>().toBeNever()
		expectTypeOf<InferClientError<never>>().toBeNever()
		expectTypeOf<InferClientData<Client["cart"]>>().toBeNever()
		expectTypeOf<InferClientError<Client["cart"]>>().toBeNever()
		expectTypeOf<InferClientInput<Client["cart"]>>().toBeNever()
		expectTypeOf<InferClientResult<Client["cart"]>>().toBeNever()
	})
})

describe("an unaugmented KizloProcedureRegistry", () => {
	// `ActiveKizloClient` short-circuits the whole client to `any` until generated code registers a
	// contract. That registration is program-wide here, so the fallback is asserted through the
	// `any` it resolves to: a freshly scaffolded project must still compile against these helpers.
	it("keeps every helper permissive rather than collapsing to `never`", () => {
		expectTypeOf<InferClientInput<any>>().toBeAny()
		expectTypeOf<InferClientData<any>>().toBeAny()
		expectTypeOf<InferClientError<any>>().toBeAny()
		expectTypeOf<InferClientResult<any>>().toBeAny()
	})
})
