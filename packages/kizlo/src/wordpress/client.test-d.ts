import { describe, expectTypeOf, it } from "vitest"
import type { EmailService } from "../email/service"
import type { SettingsService } from "../settings/service"
import { createWordPressClient, wpEndpoint } from "./endpoint"
import type { WordPressTransport } from "./transport"
import type {
	ActiveWordPressClient,
	WP_CallOptions,
	WP_Client,
	WP_Endpoint,
	WP_EndpointData,
	WP_EndpointInput,
	WP_EndpointResult,
	WP_Result,
} from "./types"

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

	it("carries per-call headers alongside signal and timeout", async () => {
		expectTypeOf(await client.books.count({}, { headers: { "X-Kizlo-User-Id": "7" } })).toEqualTypeOf<List>()
		expectTypeOf(await client.books.retrieve({ identifier: "dune" }, { headers: {}, timeout: "5 seconds" })).toEqualTypeOf<Retrieve>()
		// @ts-expect-error the definition owns the path, not the caller
		client.books.count({}, { path: "/elsewhere" })
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

/**
 * The migrated modules address their routes by path rather than holding a WordPress shape of their
 * own, so these assert against whatever this repo's `wordpress.ts` currently declares.
 */
describe("addressing an endpoint by path", () => {
	it("resolves the email endpoint's real payload", () => {
		expectTypeOf<WP_EndpointData<"email.send">>().toEqualTypeOf<{ subject: string; to: string[] }>()
		expectTypeOf<WP_EndpointData<"email.send">>().not.toHaveProperty("success")
	})

	it("resolves an endpoint's input, path parameter included", () => {
		expectTypeOf<WP_EndpointInput<"settings.postTypes.update">>().toHaveProperty("slug")
		expectTypeOf<WP_EndpointInput<"seo.sitemaps.list_urls">>().toEqualTypeOf<{
			key: string
			page?: number
			type: "post_type" | "taxonomy"
		}>()
	})

	it("answers `never` for a route this WordPress does not serve", () => {
		expectTypeOf<WP_EndpointData<"seo.nowhere.retrieve">>().toBeNever()
		expectTypeOf<WP_EndpointResult<"seo.nowhere.retrieve">>().toBeNever()
		expectTypeOf<WP_EndpointInput<"seo.nowhere.retrieve">>().toBeNever()
	})
})

/**
 * The routes WordPress serves and Kizlo only describes. Asserted against this repo's generated
 * `wordpress.ts`, so a contract that stops matching the call sites fails here rather than in the
 * procedure that makes the call.
 */
describe("described WordPress core routes", () => {
	const wordpress = null as unknown as ActiveWordPressClient

	it("reads a comment through the route WordPress owns", async () => {
		expectTypeOf(await wordpress.comments.retrieve({ id: 7 })).toEqualTypeOf<WP_EndpointResult<"comments.retrieve">>()
		expectTypeOf(await wordpress.comments.retrieve({ id: 7, password: "hunter2" })).toEqualTypeOf<WP_EndpointResult<"comments.retrieve">>()
		// @ts-expect-error core matches digits on this route, so the id is never a slug
		await wordpress.comments.retrieve({ id: "7" })
		// @ts-expect-error `context` is undeclared, so no caller can reshape the response
		await wordpress.comments.retrieve({ id: 7, context: "edit" })
	})

	it("separates the Kizlo submission from the route it stands in for", () => {
		expectTypeOf<WP_EndpointInput<"kizlo.comments.create">>().toHaveProperty("post_id")
		expectTypeOf<WP_EndpointInput<"comments.create">>().toHaveProperty("post")
		expectTypeOf<WP_EndpointInput<"comments.create">>().not.toHaveProperty("post_id")
	})

	it("types a list filter as the array core declares it to be", async () => {
		expectTypeOf(await wordpress.menuItems.list({ menus: [4], status: ["publish"] })).toEqualTypeOf<WP_EndpointResult<"menuItems.list">>()
		// @ts-expect-error a bare value is collapsed to a list before the call, never sent as one
		await wordpress.menuItems.list({ menus: 4 })
		// @ts-expect-error only the statuses WordPress publishes
		await wordpress.menuItems.list({ status: ["nonsense"] })
	})

	it("carries the pagination headers resolveList reads off a list", () => {
		type Success = Extract<WP_EndpointResult<"menuItems.list">, { error: null }>

		expectTypeOf<NonNullable<Success["headers"]["__kizloHeaders"]>>().toHaveProperty("X-WP-Total")
		expectTypeOf<NonNullable<Success["headers"]["__kizloHeaders"]>>().toHaveProperty("X-WP-TotalPages")
	})

	it("describes the menu containers, not only the items", () => {
		expectTypeOf<WP_EndpointData<"menus.retrieve">>().toHaveProperty("slug")
		expectTypeOf<WP_EndpointResult<"menus.delete">>().not.toBeNever()
	})
})

describe("services bound to the generated client", () => {
	const settings = null as unknown as SettingsService
	const email = null as unknown as EmailService

	it("writes settings through the endpoint that owns the route", async () => {
		expectTypeOf(await settings.updateSite({ title_separator: "|" })).toEqualTypeOf<WP_EndpointResult<"settings.site.update">>()
		// @ts-expect-error WordPress accepts only the separators it publishes
		await settings.updateSite({ title_separator: "!!" })
		// @ts-expect-error the key rides the path, passed separately
		await settings.updatePostType("post", { slug: "post" })
	})

	it("resolves a successful send rather than reading a flag that is not there", async () => {
		expectTypeOf(await email.send({ to: "a@b.test", subject: "hi", body: "<p>hi</p>" })).toEqualTypeOf<void>()
	})
})
