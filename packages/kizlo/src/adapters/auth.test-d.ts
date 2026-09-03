import { describe, expectTypeOf, it } from "vitest"
import { type AuthAdapter, type AuthUser, createAuthAdapter } from "./auth"

describe("AuthAdapter contract", () => {
	it("accepts an adapter that implements only getSession", () => {
		const adapter = createAuthAdapter({
			getSession: () => ({ id: "auth-1", email: "ada@example.com" }),
		})

		expectTypeOf(adapter).toEqualTypeOf<AuthAdapter>()
	})

	it("resolves getSession to an AuthUser (or null), never a WordPress row", () => {
		const adapter: AuthAdapter = { getSession: () => null }

		expectTypeOf(adapter.getSession).returns.toEqualTypeOf<AuthUser | null | Promise<AuthUser | null>>()
	})

	it("types the id as a third-party string and requires the email join key", () => {
		expectTypeOf<AuthUser["id"]>().toEqualTypeOf<string>()
		expectTypeOf<AuthUser["email"]>().toEqualTypeOf<string>()
	})

	it("rejects the previous getUser / numeric-id shape", () => {
		// @ts-expect-error getUser is gone; getSession is the required member.
		const legacy: AuthAdapter = { getUser: () => ({ id: 1, email: "a@b.com", firstName: "A", lastName: "B" }) }
		void legacy

		// @ts-expect-error id is a third-party string, never a WordPress numeric id.
		const user: AuthUser = { id: 1, email: "a@b.com" }
		void user
	})
})
