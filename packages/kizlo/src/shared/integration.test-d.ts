import { describe, expectTypeOf, it } from "vitest"
import z from "zod/v4"
import { createIntegration, type EnvRecord, type InferIntegrationProcedures, type KizloEnv } from "./integration"
import { createProcedure, type Procedure } from "./procedure"

type ScopeOf<P> = P extends Procedure<infer S, any, any, any> ? S : never
type InputOf<P> = P extends Procedure<any, infer I, any, any> ? I : never
type OutputOf<P> = P extends Procedure<any, any, infer O, any> ? O : never
type ErrorsOf<P> = P extends Procedure<any, any, any, infer E> ? E : never

const billing = createIntegration({
	id: "billing",
	procedures: {
		invoices: {
			get: createProcedure(
				{
					scope: "remote",
					input: z.object({ id: z.string() }),
					output: z.object({ total: z.number() }),
					errors: { INVOICE_MISSING: { status: 404 } },
				},
				async () => ({ total: 1 }),
			),
		},
	},
})

const loyalty = createIntegration({
	id: "loyalty",
	procedures: {
		points: createProcedure({ scope: "api", output: z.number() }, async () => 1),
	},
})

const adapterOnly = createIntegration({ id: "auth-provider", adapters: { auth: { getSession: () => null } } })
const emptyProcedures = createIntegration({ id: "empty", procedures: {} })

describe("InferIntegrationProcedures", () => {
	it("mounts nested procedures under the integration id without losing their types", () => {
		type Procedures = InferIntegrationProcedures<[typeof billing]>
		type GetInvoice = Procedures["billing"]["invoices"]["get"]

		expectTypeOf<keyof Procedures>().toEqualTypeOf<"billing">()
		expectTypeOf<ScopeOf<GetInvoice>>().toEqualTypeOf<"remote">()
		expectTypeOf<InputOf<GetInvoice>>().toEqualTypeOf<{ id: string }>()
		expectTypeOf<OutputOf<GetInvoice>>().toEqualTypeOf<{ total: number }>()
		expectTypeOf<keyof ErrorsOf<GetInvoice>>().toEqualTypeOf<"INVOICE_MISSING">()
	})

	it("intersects multiple integrations under their respective ids", () => {
		type Procedures = InferIntegrationProcedures<[typeof billing, typeof loyalty]>

		expectTypeOf<keyof Procedures>().toEqualTypeOf<"billing" | "loyalty">()
	})

	it("resolves an empty integration list to an empty record", () => {
		expectTypeOf<InferIntegrationProcedures<[]>>().toEqualTypeOf<Record<never, never>>()
	})

	it("drops adapter-only and empty-procedure integrations", () => {
		expectTypeOf<InferIntegrationProcedures<[typeof adapterOnly, typeof emptyProcedures]>>().toEqualTypeOf<Record<never, never>>()
	})
})

describe("KizloEnv", () => {
	it("exposes Kizlo's runtime-neutral values and accepts provider values", () => {
		expectTypeOf<KizloEnv>().toHaveProperty("baseUrl")
		expectTypeOf<KizloEnv>().toHaveProperty("mode")
		expectTypeOf<KizloEnv>().toHaveProperty("remote")
		expectTypeOf<KizloEnv>().toHaveProperty("local")
		expectTypeOf<KizloEnv["providerSecret"]>().toEqualTypeOf<string | EnvRecord | undefined>()
	})
})
