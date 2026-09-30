import { describe, expectTypeOf, it } from "vitest"
import type { ActiveKizloClient, KizloBrowserClient } from "./client"
import { type KizloContextValue, type KizloProviderProps, useKizloContext } from "./react"

// The registry is filled once for the whole typecheck program, by the `declare module "./client"` in
// `kizlo.test-d.ts`. A second augmentation here would collide with it, so these assertions read that
// same registered tree: core WordPress procedures plus its `billing` integration.

describe("useKizloContext", () => {
	it("returns the context value", () => {
		expectTypeOf(useKizloContext()).toEqualTypeOf<KizloContextValue>()
	})

	it("types `client` from the procedures the app registered", () => {
		const { client } = useKizloContext()

		expectTypeOf(client).not.toBeAny()
		expectTypeOf(client.posts.list).toBeFunction()
	})

	it("rejects a namespace the registered procedures do not declare", () => {
		const { client } = useKizloContext()

		// @ts-expect-error reviews is not a registered namespace
		client.reviews
	})
})

describe("KizloProviderProps", () => {
	it("takes the callable procedure tree", () => {
		expectTypeOf<KizloProviderProps["client"]>().toEqualTypeOf<ActiveKizloClient>()
	})

	it("rejects the wrapper `createKizloClient` returns", () => {
		expectTypeOf<KizloBrowserClient>().not.toMatchTypeOf<KizloProviderProps["client"]>()
	})
})
