import { describe, expectTypeOf, it } from "vitest"
import z from "zod/v4"
import { createKizloClient } from "./client"
import type { Kizlo, RootProcedures, S2SClient } from "./kizlo"
import type { CommonErrorCode } from "./shared/error"
import { createIntegration } from "./shared/integration"
import { createProcedure } from "./shared/procedure"
import type { InferProcedureData, InferProcedureError, InferProcedureInput, InferProcedureResult } from "./shared/result"

type ResultOf<T> = T extends (...args: never[]) => Promise<infer R> ? R : never
type SuccessData<R> = R extends { success: true; data: infer D } ? D : never
type DataOf<T> = SuccessData<ResultOf<T>>

const billing = createIntegration({
	id: "billing",
	procedures: {
		invoices: {
			get: createProcedure(
				{
					scope: "api",
					path: "/invoices/{id}",
					output: z.object({ total: z.number() }),
					errors: { INVOICE_MISSING: { status: 404 } },
				},
				async () => ({ total: 1 }),
			),
		},
	},
})

type Integrations = [typeof billing]

declare const kizlo: Kizlo<Integrations>
declare const rootProcedures: RootProcedures<Integrations>
const browser = createKizloClient(rootProcedures)

// ====================================================
// SERVER-TO-SERVER CLIENT
// ====================================================

describe("Kizlo server-to-server client", () => {
	it("exposes its type as `S2SClient` over the assembled root procedures", () => {
		expectTypeOf(kizlo.client).toEqualTypeOf<S2SClient<Integrations>>()
	})

	it("resolves core api procedure output to the real type, never `any`", () => {
		type ListData = DataOf<typeof kizlo.client.posts.list>
		expectTypeOf<ListData>().not.toBeAny()
	})

	it("resolves internal procedure output on the server client, never `any`", () => {
		type RobotsData = DataOf<typeof kizlo.client.seo.robots>
		expectTypeOf<RobotsData>().not.toBeAny()
	})

	it("mounts an integration's procedures under its id with typed output", () => {
		type GetData = DataOf<typeof kizlo.client.billing.invoices.get>
		expectTypeOf<GetData>().toEqualTypeOf<{ total: number }>()
		expectTypeOf<GetData>().not.toBeAny()
	})
})

// ====================================================
// PUBLIC PROCEDURE INFERENCE
// ====================================================

describe("public procedure inference helpers", () => {
	it("infers every wrapped call type from a core procedure object", () => {
		type Procedure = typeof rootProcedures.posts.get

		expectTypeOf<InferProcedureInput<Procedure>>().toEqualTypeOf<Parameters<typeof kizlo.client.posts.get>[0]>()
		expectTypeOf<InferProcedureData<Procedure>>().toEqualTypeOf<DataOf<typeof kizlo.client.posts.get>>()
		expectTypeOf<InferProcedureError<Procedure>>().toEqualTypeOf<Exclude<ResultOf<typeof kizlo.client.posts.get>["error"], null>>()
		expectTypeOf<InferProcedureResult<Procedure>>().toEqualTypeOf<ResultOf<typeof kizlo.client.posts.get>>()
	})

	it("includes declared and common errors for an integration procedure", () => {
		type Procedure = typeof rootProcedures.billing.invoices.get

		expectTypeOf<InferProcedureInput<Procedure>>().toEqualTypeOf<{ params: { id: string } }>()
		expectTypeOf<InferProcedureData<Procedure>>().toEqualTypeOf<{ total: number }>()
		expectTypeOf<InferProcedureError<Procedure>["code"]>().toEqualTypeOf<CommonErrorCode | "INVOICE_MISSING">()
		expectTypeOf<InferProcedureResult<Procedure>>().toEqualTypeOf<ResultOf<typeof kizlo.client.billing.invoices.get>>()
	})
})

// ====================================================
// BROWSER CLIENT: scope filtering
// ====================================================

describe("createKizloClient browser client", () => {
	it("exposes api-scoped core procedures", () => {
		expectTypeOf(browser.client.posts.list).toBeFunction()
	})

	it("exposes api-scoped integration procedures", () => {
		expectTypeOf(browser.client.billing.invoices.get).toBeFunction()
	})

	it("omits internal-only namespaces from the browser surface", () => {
		// @ts-expect-error seo is not present on the browser client
		browser.client.seo
	})
})
