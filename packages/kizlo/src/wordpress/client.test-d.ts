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
	WP_EndpointError,
	WP_EndpointInput,
	WP_EndpointPath,
	WP_EndpointResult,
	WP_Failure,
	WP_Result,
	WP_Success,
	WP_TypedHeaders,
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

describe("WP_TypedHeaders", () => {
	type TypedHeaders = WP_TypedHeaders<{ "X-Optional"?: string; "X-Required": number }>
	const headers = null as unknown as TypedHeaders

	it("reads required declarations as strings regardless of case", () => {
		expectTypeOf(headers.get("X-Required")).toEqualTypeOf<string>()
		expectTypeOf(headers.get("x-required")).toEqualTypeOf<string>()
		expectTypeOf(headers.get("X-rEqUiReD")).toEqualTypeOf<string>()
	})

	it("keeps optional, unknown, and dynamic names nullable", () => {
		const dynamicName = "x-required" as string

		expectTypeOf(headers.get("X-Optional")).toEqualTypeOf<string | null>()
		expectTypeOf(headers.get("X-Unknown")).toEqualTypeOf<string | null>()
		expectTypeOf(headers.get(dynamicName)).toEqualTypeOf<string | null>()
	})

	it("remains assignable to the native Headers surface", () => {
		expectTypeOf<TypedHeaders>().toMatchTypeOf<Headers>()
	})

	it("keeps legacy result unions callable before regeneration", () => {
		type LegacyResult = WP_Success<null, 200, { "X-Required": number }> | WP_Failure<"failed", number, Record<string, never>>
		const result = null as unknown as LegacyResult
		const required = result.headers.get("x-required")

		expectTypeOf(required).toEqualTypeOf<string | null>()
		if (result.error === null) expectTypeOf(result.headers.get("x-required")).toEqualTypeOf<string>()
	})
})

describe("createWordPressClient", () => {
	const transport = null as unknown as WordPressTransport
	const client = createWordPressClient(transport, {
		books: {
			retrieve: wpEndpoint<{ params: { identifier: string } }, Retrieve>(null as never),
			list: wpEndpoint<{ query?: { page?: number } }, List>(null as never),
			count: wpEndpoint<Record<string, never>, List>(null as never),
			replaceTags: wpEndpoint<{ params: { id: number }; body: Array<{ slug: string }> }, List>(null as never),
		},
	})

	it("resolves an endpoint to its own result, not a widened one", async () => {
		expectTypeOf(client.books.retrieve).parameter(0).toEqualTypeOf<{ params: { identifier: string } }>()
		expectTypeOf(await client.books.retrieve({ params: { identifier: "dune" } })).toEqualTypeOf<Retrieve>()
	})

	it("calls an endpoint whose input is entirely optional without one", async () => {
		expectTypeOf(await client.books.list()).toEqualTypeOf<List>()
		expectTypeOf(await client.books.count()).toEqualTypeOf<List>()
		expectTypeOf(await client.books.list({ query: { page: 2 } })).toEqualTypeOf<List>()
	})

	it("keeps the transport reachable for calls the tree does not describe", () => {
		expectTypeOf(client.get).toEqualTypeOf<WordPressTransport["get"]>()
		expectTypeOf(client.resolveList).toEqualTypeOf<WordPressTransport["resolveList"]>()
	})

	it("carries per-call headers alongside signal and timeout", async () => {
		expectTypeOf(await client.books.count({}, { headers: { "X-Kizlo-User-Id": "7" } })).toEqualTypeOf<List>()
		expectTypeOf(
			await client.books.retrieve({ params: { identifier: "dune" } }, { headers: {}, timeout: "5 seconds" }),
		).toEqualTypeOf<Retrieve>()
		// @ts-expect-error the definition owns the path, not the caller
		client.books.count({}, { path: "/elsewhere" })
	})

	it("rejects an endpoint the tree does not carry", () => {
		// @ts-expect-error unknown namespace
		client.albums.retrieve({ params: { identifier: "x" } })
		// @ts-expect-error unknown endpoint
		client.books.archive({ params: { identifier: "x" } })
		// @ts-expect-error unknown input field
		client.books.retrieve({ params: { identifier: "x" }, unknown: true })
	})

	it("keeps each part to its own shape, so a field cannot land in the wrong one", async () => {
		expectTypeOf(await client.books.replaceTags({ params: { id: 4 }, body: [{ slug: "sci-fi" }] })).toEqualTypeOf<List>()
		// @ts-expect-error a query field passed where the part it belongs to is named
		client.books.list({ page: 2 })
		// @ts-expect-error an object body where the endpoint declares an array
		client.books.replaceTags({ params: { id: 4 }, body: { slug: "sci-fi" } })
		// @ts-expect-error a path parameter is not a query parameter
		client.books.retrieve({ query: { identifier: "dune" } })
	})
})

/**
 * The migrated modules address their routes by path rather than holding a WordPress shape of their
 * own, so these assert against whatever this repo's `introspection.ts` currently declares.
 */
describe("addressing an endpoint by path", () => {
	it("exposes only generated raw operation paths", () => {
		const path: WP_EndpointPath = "kizlo.postTypes.post.retrieve"
		expectTypeOf(path).toEqualTypeOf<"kizlo.postTypes.post.retrieve">()
		// @ts-expect-error public procedure names do not become fake raw endpoints
		const publicProcedure: WP_EndpointPath = "woocommerce.products.get"
		// @ts-expect-error unknown raw endpoint path
		const missing: WP_EndpointPath = "kizlo.seo.nowhere.retrieve"
		void publicProcedure
		void missing
	})

	it("resolves the email endpoint's real payload", () => {
		expectTypeOf<WP_EndpointData<"kizlo.email.send">>().toEqualTypeOf<{ subject: string; to: string[] }>()
		expectTypeOf<WP_EndpointData<"kizlo.email.send">>().not.toHaveProperty("success")
	})

	it("resolves an endpoint's input, path parameter included", () => {
		expectTypeOf<WP_EndpointInput<"kizlo.settings.postTypes.update">>().toHaveProperty("params")
		expectTypeOf<WP_EndpointInput<"kizlo.settings.postTypes.update">["params"]>().toHaveProperty("slug")
		expectTypeOf<WP_EndpointInput<"kizlo.seo.sitemaps.listUrls">>().toEqualTypeOf<{
			params: {
				key: string
				type: "post_type" | "taxonomy"
			}
			query?: {
				page?: number
			}
		}>()
	})

	it("resolves the complete result and its non-null error", () => {
		expectTypeOf<WP_EndpointError<"kizlo.email.send">>().toEqualTypeOf<Exclude<WP_EndpointResult<"kizlo.email.send">["error"], null>>()
		expectTypeOf<WP_EndpointResult<"kizlo.email.send">>().not.toBeNever()
	})
})

/**
 * The routes WordPress serves and Kizlo only describes. Asserted against this repo's generated
 * `introspection.ts`, so a contract that stops matching the call sites fails here rather than in the
 * procedure that makes the call.
 */
describe("described WordPress core routes", () => {
	const wordpress = null as unknown as ActiveWordPressClient

	it("reads a comment through the route WordPress owns", async () => {
		expectTypeOf(await wordpress.comments.retrieve({ params: { id: 7 } })).toEqualTypeOf<WP_EndpointResult<"comments.retrieve">>()
		expectTypeOf(await wordpress.comments.retrieve({ params: { id: 7 }, query: { password: "hunter2" } })).toEqualTypeOf<
			WP_EndpointResult<"comments.retrieve">
		>()
		// @ts-expect-error core matches digits on this route, so the id is never a slug
		await wordpress.comments.retrieve({ params: { id: "7" } })
		// @ts-expect-error `context` is undeclared, so no caller can reshape the response
		await wordpress.comments.retrieve({ params: { id: 7 }, query: { context: "edit" } })
	})

	it("separates the Kizlo submission from the route it stands in for", () => {
		expectTypeOf<WP_EndpointInput<"kizlo.comments.create">["body"]>().toHaveProperty("post_id")
		expectTypeOf<NonNullable<WP_EndpointInput<"comments.create">["body"]>>().toHaveProperty("post")
		expectTypeOf<NonNullable<WP_EndpointInput<"comments.create">["body"]>>().not.toHaveProperty("post_id")
	})

	it("types a list filter as the array core declares it to be", async () => {
		expectTypeOf(await wordpress.menuItems.list({ query: { menus: [4], status: ["publish"] } })).toEqualTypeOf<
			WP_EndpointResult<"menuItems.list">
		>()
		// @ts-expect-error a bare value is collapsed to a list before the call, never sent as one
		await wordpress.menuItems.list({ query: { menus: 4 } })
		// @ts-expect-error only the statuses WordPress publishes
		await wordpress.menuItems.list({ query: { status: ["nonsense"] } })
	})

	it("types the pagination headers resolveList reads off a list", () => {
		type Success = Extract<WP_EndpointResult<"menuItems.list">, { error: null }>
		const headers = null as unknown as Success["headers"]

		expectTypeOf(headers.get("x-wp-total")).toEqualTypeOf<string>()
		expectTypeOf(headers.get("X-WP-TotalPages")).toEqualTypeOf<string>()
		expectTypeOf(headers.get("x-not-declared")).toEqualTypeOf<string | null>()
	})

	it("keeps headers callable before the endpoint result is narrowed", async () => {
		const response = await wordpress.kizlo.postTypes.post.list()
		const total = response.headers.get("x-wp-total")

		expectTypeOf(total).toEqualTypeOf<string | null>()
		if (response.error === null) expectTypeOf(response.headers.get("x-wp-total")).toEqualTypeOf<string>()
	})

	it("describes the menu containers, not only the items", () => {
		expectTypeOf<WP_EndpointData<"menus.retrieve">>().toHaveProperty("slug")
		expectTypeOf<WP_EndpointResult<"menus.delete">>().not.toBeNever()
	})
})

/**
 * The WooCommerce routes the plugin describes and WooCommerce serves. Asserted against this repo's
 * generated `introspection.ts` the same way the core block above is, so a WooCommerce release that moves
 * one of these shapes fails here rather than inside the integration that calls it.
 */
describe("described WooCommerce routes", () => {
	const wordpress = null as unknown as ActiveWordPressClient

	it("carries the session headers on a cart call without putting them in the input", async () => {
		expectTypeOf(await wordpress.woocommerce.store.cart.get({}, { headers: { "X-Kizlo-Guest-Token": "t_1" } })).toEqualTypeOf<
			WP_EndpointResult<"woocommerce.store.cart.get">
		>()
		// @ts-expect-error the cart is named by a header, so the operation takes no parameters
		await wordpress.woocommerce.store.cart.get({ query: { guest_token: "t_1" } })
	})

	it("types each cart mutation with the arguments WooCommerce registered", async () => {
		expectTypeOf(await wordpress.woocommerce.store.cart.addItem({ body: { id: 4, quantity: 2, variation: [] } })).toEqualTypeOf<
			WP_EndpointResult<"woocommerce.store.cart.addItem">
		>()
		expectTypeOf<WP_EndpointInput<"woocommerce.store.cart.updateItem">["body"]>().toHaveProperty("key")
		expectTypeOf<WP_EndpointInput<"woocommerce.store.cart.applyCoupon">["body"]>().toHaveProperty("code")
		// @ts-expect-error remove-item takes the item key, never the product ID
		await wordpress.woocommerce.store.cart.removeItem({ body: { id: 4 } })
		// Every cart route answers with the whole cart, which is what lets one deserializer serve them all.
		expectTypeOf<WP_EndpointData<"woocommerce.store.cart.addItem">>().toEqualTypeOf<WP_EndpointData<"woocommerce.store.cart.get">>()
	})

	/**
	 * WooCommerce registers these arguments without `required`, then reads them in the handler
	 * regardless, so the plugin marks them and these are the calls that stop compiling because of it.
	 * A bare mutation is the one worth guarding hardest: every property being optional is what made
	 * the whole input argument optional, so `removeItem()` used to be a call you could write.
	 */
	it("refuses a cart mutation missing what its handler reads", async () => {
		// @ts-expect-error the cart cannot add an unnamed product
		await wordpress.woocommerce.store.cart.addItem({ quantity: 2 })
		// @ts-expect-error an update names the item it changes and the quantity to change it to
		await wordpress.woocommerce.store.cart.updateItem({ key: "a1b2" })
		// @ts-expect-error removal is by item key, and there is no cart-wide default
		await wordpress.woocommerce.store.cart.removeItem()
		// @ts-expect-error both coupon operations name a code
		await wordpress.woocommerce.store.cart.applyCoupon()
		// @ts-expect-error and neither treats an absent one as "whichever is applied"
		await wordpress.woocommerce.store.cart.removeCoupon()
	})

	/**
	 * The other half of the overlay, and the reason it is written per operation rather than applied to
	 * every optional Woo argument: these calls are meaningful with nothing in them and stay callable.
	 */
	it("leaves an operation callable when its arguments really are optional", async () => {
		expectTypeOf(await wordpress.woocommerce.store.cart.get()).toEqualTypeOf<WP_EndpointResult<"woocommerce.store.cart.get">>()
		expectTypeOf(await wordpress.woocommerce.store.cart.updateCustomer()).toEqualTypeOf<
			WP_EndpointResult<"woocommerce.store.cart.updateCustomer">
		>()
		// `CartController::add_to_cart()` fills a null quantity with the product's minimum, and a
		// variation only means anything on a variable product, so neither is required alongside the ID.
		expectTypeOf(await wordpress.woocommerce.store.cart.addItem({ body: { id: 4 } })).toEqualTypeOf<
			WP_EndpointResult<"woocommerce.store.cart.addItem">
		>()
	})

	it("types the product filters the storefront actually sends", async () => {
		expectTypeOf(
			await wordpress.woocommerce.store.products.list({ query: { per_page: 12, stock_status: ["instock"], rating: [4, 5] } }),
		).toEqualTypeOf<WP_EndpointResult<"woocommerce.store.products.list">>()
		// @ts-expect-error only the stock statuses WooCommerce publishes
		await wordpress.woocommerce.store.products.list({ query: { stock_status: ["nonsense"] } })
		// @ts-expect-error `context` is undeclared, so no caller can reshape the response
		await wordpress.woocommerce.store.products.list({ query: { context: "edit" } })
		expectTypeOf<NonNullable<WP_EndpointInput<"woocommerce.store.products.collectionData">["query"]>>().toHaveProperty(
			"calculate_price_range",
		)
		expectTypeOf<NonNullable<WP_EndpointInput<"woocommerce.store.products.list">["query"]>["date_column"]>().toEqualTypeOf<
			"date" | "date_gmt" | "modified" | "modified_gmt" | undefined
		>()
		expectTypeOf<NonNullable<WP_EndpointInput<"woocommerce.store.products.collectionData">["query"]>["date_column"]>().toEqualTypeOf<
			"date" | "date_gmt" | "modified" | "modified_gmt" | undefined
		>()
	})

	it("types the pagination headers resolveList reads off a product page", () => {
		type Success = Extract<WP_EndpointResult<"woocommerce.store.products.list">, { error: null }>
		const headers = null as unknown as Success["headers"]

		expectTypeOf(headers.get("x-wp-total")).toEqualTypeOf<string>()
		expectTypeOf(headers.get("X-WP-TotalPages")).toEqualTypeOf<string>()
		expectTypeOf(headers.get("x-not-declared")).toEqualTypeOf<string | null>()
	})

	it("separates updating a checkout from submitting one", () => {
		// WooCommerce honours this without registering it, so it is described by hand or not at all.
		expectTypeOf<NonNullable<WP_EndpointInput<"woocommerce.store.checkout.update">["body"]>>().toHaveProperty("__experimental_calc_totals")
		expectTypeOf<NonNullable<WP_EndpointInput<"woocommerce.store.checkout.process">["body"]>>().toHaveProperty("payment_data")
		expectTypeOf<NonNullable<WP_EndpointInput<"woocommerce.store.checkout.update">["body"]>>().not.toHaveProperty("payment_data")
		// Returned by both checkout responses and declared by neither.
		expectTypeOf<WP_EndpointData<"woocommerce.store.checkout.get">>().toHaveProperty("__experimentalCart")
	})

	it("substitutes the order into the path a retry is paid on", async () => {
		const order = {
			params: { id: 12 },
			body: {
				key: "wc_order_x",
				billing_address: {} as never,
				shipping_address: {} as never,
				payment_method: "bacs",
			},
		}

		expectTypeOf(await wordpress.woocommerce.store.checkout.processOrder(order)).toEqualTypeOf<
			WP_EndpointResult<"woocommerce.store.checkout.processOrder">
		>()
		// @ts-expect-error WooCommerce matches digits only on this route
		await wordpress.woocommerce.store.checkout.processOrder({ ...order, params: { id: "12" } })
		// @ts-expect-error the order is required, since it is the path
		await wordpress.woocommerce.store.checkout.processOrder({ key: "wc_order_x" })
	})

	it("reaches the REST v3 routes the Store API has no answer for", async () => {
		expectTypeOf(await wordpress.woocommerce.products.retrieve({ params: { id: 4 } })).toEqualTypeOf<
			WP_EndpointResult<"woocommerce.products.retrieve">
		>()
		expectTypeOf(await wordpress.woocommerce.customers.retrieve({ params: { id: 2 } })).toEqualTypeOf<
			WP_EndpointResult<"woocommerce.customers.retrieve">
		>()
		// The slug lookup is why the list is described at all.
		expectTypeOf<NonNullable<WP_EndpointInput<"woocommerce.products.list">["query"]>>().toHaveProperty("slug")
		// Both product shapes carry what this plugin adds, in the place each API puts it.
		expectTypeOf<WP_EndpointData<"woocommerce.products.retrieve">>().toHaveProperty("kizlo")
		expectTypeOf<WP_EndpointData<"woocommerce.store.products.list">[number]["extensions"]>().toHaveProperty("kizlo")
	})

	it("types the writes from the arguments WooCommerce registers, not from the item schema", async () => {
		expectTypeOf(await wordpress.woocommerce.products.create({ body: { name: "Thing", regular_price: "10" } })).toEqualTypeOf<
			WP_EndpointResult<"woocommerce.products.create">
		>()
		expectTypeOf(await wordpress.woocommerce.customers.update({ params: { id: 2 }, body: { first_name: "Ada" } })).toEqualTypeOf<
			WP_EndpointResult<"woocommerce.customers.update">
		>()
		// `readonly` properties are dropped on the way in, so a create cannot set them.
		expectTypeOf<NonNullable<WP_EndpointInput<"woocommerce.products.create">["body"]>>().not.toHaveProperty("id")
		expectTypeOf<NonNullable<WP_EndpointInput<"woocommerce.products.create">["body"]>>().not.toHaveProperty("permalink")
		// @ts-expect-error only the statuses WooCommerce publishes
		await wordpress.woocommerce.products.create({ body: { status: "nonsense" } })
	})

	it("declares the delete arguments each resource actually takes", async () => {
		expectTypeOf<NonNullable<WP_EndpointInput<"woocommerce.products.delete">["query"]>>().toHaveProperty("force")
		// Customers are users, which are not trashable, so a delete also reassigns their posts.
		expectTypeOf<NonNullable<WP_EndpointInput<"woocommerce.customers.delete">["query"]>>().toHaveProperty("reassign")
		expectTypeOf<NonNullable<WP_EndpointInput<"woocommerce.products.delete">["query"]>>().not.toHaveProperty("reassign")
		// A delete answers with what it removed rather than a deletion envelope.
		expectTypeOf<WP_EndpointData<"woocommerce.customers.delete">>().toHaveProperty("email")
		expectTypeOf(await wordpress.woocommerce.customers.delete({ params: { id: 2 }, query: { force: true, reassign: 1 } })).toEqualTypeOf<
			WP_EndpointResult<"woocommerce.customers.delete">
		>()
	})

	it("builds the customer role filter from the roles this WordPress has", () => {
		// `get_collection_params()` reads `$wp_roles` directly, which is why the plugin describes
		// these on `init` rather than while WooCommerce is still loading.
		expectTypeOf<NonNullable<WP_EndpointInput<"woocommerce.customers.list">["query"]>>().toHaveProperty("role")
		expectTypeOf<NonNullable<NonNullable<WP_EndpointInput<"woocommerce.customers.list">["query"]>["role"]>>().toExtend<string>()
	})

	it("keeps Kizlo-owned order routes apart from WooCommerce's Store API", () => {
		// @ts-expect-error the removed merge endpoint no longer contributes a cart subtree
		wordpress.woocommerce.kizlo.cart
		expectTypeOf<WP_EndpointResult<"woocommerce.kizlo.orders.manageStock">>().not.toBeNever()
		expectTypeOf<WP_EndpointResult<"woocommerce.store.cart.get">>().not.toBeNever()
		expectTypeOf<WP_EndpointData<"woocommerce.store.cart.get">>().not.toHaveProperty("guest_token")
	})
})

/**
 * Error codes reach a call site from two places, and which place decides whether a caller can rely
 * on them. The generated union carries what a route publishes about itself; the common bucket
 * carries only what no document can declare, and widens every endpoint with it. These assert the
 * division from both ends, so moving a code between them cannot pass unnoticed.
 */
describe("error codes on a generated call", () => {
	type CodeOn<TPath extends WP_EndpointPath> = Extract<WP_EndpointResult<TPath>, { data: null }>["error"]["code"]
	/** An endpoint declaring nothing of its own, so its codes are the common bucket exactly. */
	type CommonCode = Extract<WP_Result<{ id: number }, never>, { data: null }>["error"]["code"]

	it("widens every endpoint with the codes no route can describe about itself", () => {
		expectTypeOf<"invalid_path_parameter">().toExtend<CommonCode>()
		expectTypeOf<"rest_no_route">().toExtend<CommonCode>()
		// Nothing was sent, so this is reachable on an endpoint whose own union cannot mention it.
		expectTypeOf<"invalid_path_parameter">().toExtend<CodeOn<"comments.retrieve">>()
	})

	it("leaves the codes WordPress publishes to the union that declares them", () => {
		expectTypeOf<"rest_forbidden">().not.toExtend<CommonCode>()
		expectTypeOf<"rest_invalid_param">().not.toExtend<CommonCode>()
		expectTypeOf<"rest_missing_callback_param">().not.toExtend<CommonCode>()
		// Still reachable where it matters, from the endpoint's own declaration rather than the bucket.
		expectTypeOf<"rest_forbidden">().toExtend<CodeOn<"comments.retrieve">>()
		expectTypeOf<"rest_invalid_param">().toExtend<CodeOn<"comments.retrieve">>()
		expectTypeOf<"rest_missing_callback_param">().toExtend<CodeOn<"comments.retrieve">>()
	})
})

describe("services bound to the generated client", () => {
	const settings = null as unknown as SettingsService
	const email = null as unknown as EmailService

	it("writes settings through the endpoint that owns the route", async () => {
		expectTypeOf(await settings.updateSite({ title_separator: "|" })).toEqualTypeOf<WP_EndpointResult<"kizlo.settings.site.update">>()
		// @ts-expect-error WordPress accepts only the separators it publishes
		await settings.updateSite({ title_separator: "!!" })
		// @ts-expect-error the key rides the path, passed separately
		await settings.updatePostType("post", { slug: "post" })
	})

	it("resolves a successful send rather than reading a flag that is not there", async () => {
		expectTypeOf(await email.send({ to: "a@b.test", subject: "hi", body: "<p>hi</p>" })).toEqualTypeOf<void>()
	})
})
