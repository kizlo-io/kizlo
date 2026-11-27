import { describe, expectTypeOf, it } from "vitest"
import type { ActiveKizloClient } from "./client"
import { type KizloContextValue, type KizloProviderProps, useKizloContext } from "./react"

describe("useKizloContext", () => {
	it("types the generated browser API", () => {
		expectTypeOf(useKizloContext()).toEqualTypeOf<KizloContextValue>()
		const { client } = useKizloContext()
		expectTypeOf(client).not.toBeAny()
		expectTypeOf(client.kizlo.content.post.list).toBeFunction()
		// @ts-expect-error admin settings are excluded from the browser projection
		client.kizlo.settings
		// @ts-expect-error an unknown namespace is not callable
		client.reviews
	})
	it("takes the direct browser client", () => {
		expectTypeOf<KizloProviderProps["client"]>().toEqualTypeOf<ActiveKizloClient>()
	})
})
