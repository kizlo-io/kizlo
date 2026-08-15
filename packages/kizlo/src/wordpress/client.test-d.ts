import { describe, expectTypeOf, it } from "vitest"
import { createWordPressClient, wpEndpoint } from "./endpoint"
import type { WordPressTransport } from "./transport"
import type { WP_CallOptions, WP_Client, WP_Endpoint, WP_Result } from "./types"

type Retrieve = WP_Result<{ id: number }, "not_found">
type List = WP_Result<{ id: number }[], "not_found">
type Endpoints = {
	books: {
		retrieve: WP_Endpoint<{ identifier: string }, Retrieve>
		list: WP_Endpoint<{ page?: number }, List>
		count: WP_Endpoint<Record<string, never>, List>
	}
	untyped: any
}

describe("WP_Client", () => {
	it("turns an endpoint leaf into the call that runs it", () => {
		expectTypeOf<WP_Client<Endpoints>["books"]["retrieve"]>().toEqualTypeOf<
			(input: { identifier: string }, options?: WP_CallOptions) => Promise<Retrieve>
		>()
	})

	it("makes input optional when every field is", () => {
		expectTypeOf<WP_Client<Endpoints>["books"]["list"]>().toEqualTypeOf<
			(input?: { page?: number }, options?: WP_CallOptions) => Promise<List>
		>()
	})

	it("makes input optional when the endpoint takes none", () => {
		expectTypeOf<WP_Client<Endpoints>["books"]["count"]>().toEqualTypeOf<
			(input?: Record<string, never>, options?: WP_CallOptions) => Promise<List>
		>()
	})

	it("passes `any` through so a project compiles before its first generation", () => {
		expectTypeOf<WP_Client<Endpoints>["untyped"]>().toBeAny()
	})
})

describe("createWordPressClient", () => {
	const transport = null as unknown as WordPressTransport
	const client = createWordPressClient(transport, {
		books: {
			retrieve: wpEndpoint<{ identifier: string }, Retrieve>(null as never),
			list: wpEndpoint<{ page?: number }, List>(null as never),
			count: wpEndpoint<Record<string, never>, List>(null as never),
		},
	})

	it("resolves an endpoint to its own result, not a widened one", async () => {
		expectTypeOf(client.books.retrieve).parameter(0).toEqualTypeOf<{ identifier: string }>()
		expectTypeOf(await client.books.retrieve({ identifier: "dune" })).toEqualTypeOf<Retrieve>()
	})

	it("calls an endpoint whose input is entirely optional without one", async () => {
		expectTypeOf(await client.books.list()).toEqualTypeOf<List>()
		expectTypeOf(await client.books.count()).toEqualTypeOf<List>()
		expectTypeOf(await client.books.list({ page: 2 })).toEqualTypeOf<List>()
	})

	it("keeps the transport reachable for calls the tree does not describe", () => {
		expectTypeOf(client.get).toEqualTypeOf<WordPressTransport["get"]>()
		expectTypeOf(client.resolveList).toEqualTypeOf<WordPressTransport["resolveList"]>()
	})

	it("rejects an endpoint the tree does not carry", () => {
		// @ts-expect-error unknown namespace
		client.albums.retrieve({ identifier: "x" })
		// @ts-expect-error unknown endpoint
		client.books.archive({ identifier: "x" })
		// @ts-expect-error unknown input field
		client.books.retrieve({ identifier: "x", unknown: true })
	})
})
