import { describe, expectTypeOf, it } from "vitest"
import z from "zod/v4"
import { createKizloClient } from "./client"
import type { Kizlo, RootRouter, S2SClient } from "./kizlo"
import { createExtension } from "./shared/extension"
import { createProcedure } from "./shared/procedure"

// Pulls the success-branch `data` type out of a `ProcedureMethod` on a result client.
// `SuccessData` takes a naked param so it distributes over the KizloResult union.
type ResultOf<T> = T extends (...args: never[]) => Promise<infer R> ? R : never
type SuccessData<R> = R extends { success: true; data: infer D } ? D : never
type DataOf<T> = SuccessData<ResultOf<T>>

const billing = createExtension({
	id: "billing",
	init: () => ({
		router: {
			invoices: {
				get: createProcedure({ scope: "api", path: "/invoices/{id}", output: z.object({ total: z.number() }) }, async () => ({
					total: 1,
				})),
			},
		},
	}),
})

type Exts = [typeof billing]

// The server client sees every scope, including internal-only namespaces like `seo`.
declare const kizlo: Kizlo<Exts>
// The browser client is built from the same assembled root router.
declare const rootRouter: RootRouter<Exts>
const browser = createKizloClient(rootRouter)

// ====================================================
// SERVER-TO-SERVER CLIENT
// ====================================================

describe("Kizlo server-to-server client", () => {
	it("exposes its type as `S2SClient` over the assembled root router", () => {
		expectTypeOf(kizlo.client).toEqualTypeOf<S2SClient<Exts>>()
	})

	it("resolves core api procedure output to the real type, never `any`", () => {
		// Regression guard: `client.posts.list()` used to collapse `data` to `any`.
		type ListData = DataOf<typeof kizlo.client.posts.list>
		expectTypeOf<ListData>().not.toBeAny()
	})

	it("resolves internal procedure output on the server client, never `any`", () => {
		type RobotsData = DataOf<typeof kizlo.client.seo.robots>
		expectTypeOf<RobotsData>().not.toBeAny()
	})

	it("mounts an extension's procedures under its id with typed output", () => {
		type GetData = DataOf<typeof kizlo.client.billing.invoices.get>
		expectTypeOf<GetData>().toEqualTypeOf<{ total: number }>()
		expectTypeOf<GetData>().not.toBeAny()
	})
})

// ====================================================
// BROWSER CLIENT — scope filtering
// ====================================================

describe("createKizloClient browser client", () => {
	it("exposes api-scoped core procedures", () => {
		expectTypeOf(browser.client.posts.list).toBeFunction()
	})

	it("exposes api-scoped extension procedures", () => {
		expectTypeOf(browser.client.billing.invoices.get).toBeFunction()
	})

	it("omits internal-only namespaces from the browser surface", () => {
		// `seo` holds only internal procedures, so it is filtered out client-side.
		// @ts-expect-error seo is not present on the browser client
		browser.client.seo
	})
})
