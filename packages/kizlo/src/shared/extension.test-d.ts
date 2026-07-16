import { describe, expectTypeOf, it } from "vitest"
import z from "zod/v4"
import { createExtension, type InferExtensionRouter } from "./extension"
import { createProcedure, type Procedure } from "./procedure"

type OutputOf<P> = P extends Procedure<any, any, infer O, any> ? O : never

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

const loyalty = createExtension({
	id: "loyalty",
	init: () => ({
		router: {
			points: createProcedure({ scope: "remote", output: z.number() }, async () => 1),
		},
	}),
})

const empty = createExtension({ id: "empty", init: () => ({}) })

describe("InferExtensionRouter", () => {
	it("mounts a single extension's router under its id", () => {
		type R = InferExtensionRouter<[typeof billing]>

		expectTypeOf<keyof R>().toEqualTypeOf<"billing">()
		expectTypeOf<OutputOf<R["billing"]["invoices"]["get"]>>().toEqualTypeOf<{ total: number }>()
		expectTypeOf<OutputOf<R["billing"]["invoices"]["get"]>>().not.toBeAny()
	})

	it("intersects multiple extensions under their respective ids", () => {
		type R = InferExtensionRouter<[typeof billing, typeof loyalty]>

		expectTypeOf<keyof R>().toEqualTypeOf<"billing" | "loyalty">()
	})

	it("resolves an empty extension list to an empty record", () => {
		expectTypeOf<InferExtensionRouter<[]>>().toEqualTypeOf<Record<never, never>>()
	})

	it("drops extensions whose router shape is not a concrete literal", () => {
		expectTypeOf<InferExtensionRouter<[typeof empty]>>().toEqualTypeOf<Record<never, never>>()
	})
})
