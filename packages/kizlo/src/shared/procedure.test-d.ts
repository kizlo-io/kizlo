import { describe, expectTypeOf, it } from "vitest"
import z from "zod/v4"
import { defineErrorMap } from "./error"
import { createMiddleware } from "./middleware"
import { createProcedure, type Procedure } from "./procedure"

// ====================================================
// Positional extractors for the `Procedure<Scope, Input, Output, Errors>` tuple.
// These let us assert each inferred generic slot independently.
// ====================================================

type ScopeOf<P> = P extends Procedure<infer S, any, any, any> ? S : never
type InputOf<P> = P extends Procedure<any, infer I, any, any> ? I : never
type OutputOf<P> = P extends Procedure<any, any, infer O, any> ? O : never
type ErrorsOf<P> = P extends Procedure<any, any, any, infer E> ? E : never

// ====================================================
// API SCOPE
// ====================================================

describe("createProcedure — api scope", () => {
	it("extracts path `{param}` placeholders into a required `params` object", () => {
		const proc = createProcedure(
			{ scope: "api", method: "GET", path: "/posts/{id}", output: z.object({ title: z.string() }) },
			async () => ({ title: "x" }),
		)

		expectTypeOf<ScopeOf<typeof proc>>().toEqualTypeOf<"api">()
		expectTypeOf<InputOf<typeof proc>>().toEqualTypeOf<{ params: { id: string } }>()
	})

	it("merges path params with an explicit `params` schema", () => {
		const proc = createProcedure(
			{
				scope: "api",
				path: "/posts/{id}",
				params: z.object({ id: z.string(), rev: z.number() }),
				output: z.object({ ok: z.boolean() }),
			},
			async () => ({ ok: true }),
		)

		expectTypeOf<InputOf<typeof proc>>().toEqualTypeOf<{ params: { id: string; rev: number } }>()
	})

	it("makes an optional query schema an optional `query` key", () => {
		const proc = createProcedure(
			{
				scope: "api",
				path: "/posts",
				query: z.object({ page: z.number() }).optional(),
				output: z.object({ ok: z.boolean() }),
			},
			async () => ({ ok: true }),
		)

		expectTypeOf<InputOf<typeof proc>>().toEqualTypeOf<{ query?: { page: number } | undefined }>()
	})

	it("jsonifies the output type (Date becomes string over the wire)", () => {
		const proc = createProcedure({ scope: "api", path: "/x", output: z.object({ when: z.date() }) }, async () => ({ when: new Date() }))

		expectTypeOf<OutputOf<typeof proc>>().toEqualTypeOf<{ when: string }>()
		expectTypeOf<OutputOf<typeof proc>>().not.toBeAny()
	})

	it("types the handler `input` with the parsed (output-side) request shape", () => {
		createProcedure({ scope: "api", path: "/posts/{id}", output: z.object({ ok: z.boolean() }) }, async ({ input }) => {
			expectTypeOf(input).toEqualTypeOf<{ params: { id: string } }>()
			return { ok: true }
		})
	})
})

// ====================================================
// REMOTE + INTERNAL SCOPES
// ====================================================

describe("createProcedure — remote scope", () => {
	it("uses the `input` schema directly and does NOT jsonify the output", () => {
		const proc = createProcedure(
			{ scope: "remote", input: z.object({ q: z.string() }), output: z.object({ when: z.date() }) },
			async () => ({ when: new Date() }),
		)

		expectTypeOf<ScopeOf<typeof proc>>().toEqualTypeOf<"remote">()
		expectTypeOf<InputOf<typeof proc>>().toEqualTypeOf<{ q: string }>()
		expectTypeOf<OutputOf<typeof proc>>().toEqualTypeOf<{ when: Date }>()
	})
})

describe("createProcedure — internal scope", () => {
	it("uses the `input` schema directly and keeps the raw output", () => {
		const proc = createProcedure(
			{ scope: "internal", input: z.object({ id: z.string() }), output: z.object({ ok: z.boolean() }) },
			async () => ({ ok: true }),
		)

		expectTypeOf<ScopeOf<typeof proc>>().toEqualTypeOf<"internal">()
		expectTypeOf<InputOf<typeof proc>>().toEqualTypeOf<{ id: string }>()
		expectTypeOf<OutputOf<typeof proc>>().toEqualTypeOf<{ ok: boolean }>()
	})

	it("resolves input to an empty object when no input schema is given", () => {
		const proc = createProcedure({ scope: "internal", output: z.object({ ok: z.boolean() }) }, async () => ({ ok: true }))

		expectTypeOf<InputOf<typeof proc>>().toEqualTypeOf<NonNullable<unknown>>()
	})
})

// ====================================================
// ERRORS
// ====================================================

describe("createProcedure — errors", () => {
	it("captures the declared error map and exposes it plus common errors to the handler", () => {
		const proc = createProcedure(
			{
				scope: "api",
				path: "/x",
				output: z.object({ ok: z.boolean() }),
				errors: defineErrorMap({ POST_NOT_FOUND: { status: 404 } }),
			},
			async ({ errors }) => {
				expectTypeOf(errors.POST_NOT_FOUND).toBeFunction()
				expectTypeOf(errors.NOT_FOUND).toBeFunction()
				return { ok: true }
			},
		)

		expectTypeOf<ErrorsOf<typeof proc>>().toEqualTypeOf<{ readonly POST_NOT_FOUND: { readonly status: 404 } }>()
	})

	it("rejects throwing an error code that was not declared", () => {
		createProcedure(
			{
				scope: "api",
				path: "/x",
				output: z.object({ ok: z.boolean() }),
				errors: defineErrorMap({ POST_NOT_FOUND: { status: 404 } }),
			},
			async ({ errors }) => {
				// @ts-expect-error NOT_A_REAL_CODE is not in the error map
				errors.NOT_A_REAL_CODE()
				return { ok: true }
			},
		)
	})
})

// ====================================================
// MIDDLEWARE CONTEXT
// ====================================================

describe("createProcedure — middleware", () => {
	it("threads context added by middleware into the handler", () => {
		const withUser = createMiddleware(async ({ next }) => next({ context: { userId: "u1" } }))

		createProcedure({ scope: "api", path: "/x", output: z.object({ ok: z.boolean() }), middlewares: [withUser] }, async ({ context }) => {
			expectTypeOf(context.userId).toEqualTypeOf<string>()
			return { ok: true }
		})
	})
})

// ====================================================
// HANDLER RETURN
// ====================================================

describe("createProcedure — handler return", () => {
	it("rejects a handler return that does not match the output schema", () => {
		createProcedure(
			{ scope: "api", path: "/x", output: z.object({ ok: z.boolean() }) },
			// @ts-expect-error handler must return { ok: boolean }
			async () => ({ ok: "not-a-boolean" }),
		)
	})
})
