import { type CookiesAdapter, createAuthAdapter } from "kizlo"
import { getKizloClientTestInstance, getKizloTestInstance, getTestCredentials } from "kizlo/test-harness"
import { afterAll, beforeAll, expect, test } from "vitest"
import { Cart, type CartBillingAddress } from "./cart/schema"
import { Checkout, type RetryCheckoutInput } from "./checkout/schema"
import { WC_CORE_BASE } from "./constants"
import { Customer } from "./customer/schema"
import { woocommerce } from "./index"
import { Order } from "./order/schema"
import { Product, ProductFilters, ProductList } from "./product/schema"
import { deserializeProduct } from "./product/utils"

/**
 * The WooCommerce integration against a real WooCommerce, calling every route through the endpoints
 * the plugin describes and the generator emits.
 *
 * These reach WooCommerce over HTTP, so they are a check on the contract as much as on the
 * procedures: a spec that mistypes an argument fails here, where a spec that merely compiles does
 * not. That is the point of having them at all.
 *
 * The cart is keyed to the signed-in test user rather than a guest token, because a direct
 * `.call()` gets the server context and its cookie storage has no adapter behind it. The
 * `X-Kizlo-User-Email` header the middleware sends instead is what carries identity between the calls
 * below, so a cart that survives from one test to the next is that header working.
 */
let kizlo: ReturnType<typeof instance>
let productId = 0
let productSlug = ""
let variableProductId = 0
let variationId = 0

function instance() {
	return getKizloTestInstance({ integrations: [woocommerce()] })
}

beforeAll(async () => {
	kizlo = instance()

	const products = await client().products.list.call({ query: { perPage: 100 } })
	const seeded = products.items.find((item) => item.slug === "test-product-1")
	if (!seeded) throw new Error("The woocommerce fixture seeded no products.")

	productId = seeded.id
	productSlug = seeded.slug

	const variable = products.items.find((item) => item.slug === "test-product-variable")
	if (!variable?.variations[0]) throw new Error("The woocommerce fixture seeded no variable product.")
	variableProductId = variable.id
	variationId = variable.variations[0].id
})

afterAll(async () => {
	// The fixture's cleanup empties the cart between runs, but leaving one behind would make the
	// first assertion of the next run depend on which test ran last here.
	await emptyCart()
})

/** The integration's procedures, so the tests below read as calls rather than as lookups. */
function client() {
	return kizlo.client.woocommerce
}

async function emptyCart(): Promise<void> {
	const cart = await client().cart.get.call()
	for (const item of cart.items) {
		await client().cart.items.remove.call({ params: { key: item.key } })
	}
}

// ==================================================
// PRODUCTS: wc/store/v1 and wc/v3
// ==================================================

test("products.list reads the Store API through the generated endpoint", async () => {
	const result = await client().products.list.call({ query: { perPage: 5 } })

	expect(ProductList.safeParse(result).success).toBe(true)
	expect(result.items.length).toBeGreaterThan(0)
	expect(result.items[0]?.custom).toEqual({ product_note: "Fixture product" })
})

test("products.list resolves pagination from the headers the contract declares", async () => {
	const result = await client().products.list.call({ query: { perPage: 2 } })

	expect(result.items).toHaveLength(2)
	expect(result.meta.totalItems).toBeGreaterThan(2)
	expect(result.meta.hasNextPage).toBe(true)
	expect(result.meta.nextPage).toBe(2)
})

test("products.list honours a filter the derived contract carries", async () => {
	const result = await client().products.list.call({ query: { slug: productSlug } })

	expect(result.items).toHaveLength(1)
	expect(result.items[0]?.id).toBe(productId)
})

test("products.get optionally resolves recommendations by slug through the Store API", async () => {
	const result = await client().products.get.call({
		params: { identifier: productSlug },
		query: { recommendations: true },
	})

	expect(Product.safeParse(result).success).toBe(true)
	expect(result.id).toBe(productId)
	expect(result.custom).toEqual({ product_note: "Fixture product" })
	expect(result.url).not.toBeNull()
	expect(result.currencyFormat.currencyCode).toBeTruthy()
	expect(Array.isArray(result.attributes)).toBe(true)
	expect(typeof result.prices.regularPrice).toBe("number")
	expect(result.categories).toEqual(
		expect.arrayContaining([expect.objectContaining({ slug: "test-product-category", url: expect.any(String) })]),
	)
	expect(result.images.every((image) => !("thumbnail" in image))).toBe(true)
	expect(result.addToCart).not.toHaveProperty("url")
	expect(result).not.toHaveProperty("hsCode")
	expect(result).not.toHaveProperty("extend")
	expect(result).not.toHaveProperty("customFields")
	expect(result.custom).toEqual(expect.any(Object))
	expect(result.recommendations).toEqual({
		upsells: expect.any(Array),
		crossSells: expect.any(Array),
		related: expect.any(Array),
	})
	expect(result.recommendations?.upsells.map((product) => product.slug)).toContain("test-product-2")
	expect(result.recommendations?.crossSells.map((product) => product.slug)).toContain("test-product-3")
	expect(result.recommendations?.related).toEqual(expect.any(Array))
})

test("products.get leaves recommendations out by default", async () => {
	const result = await client().products.get.call({ params: { identifier: productId } })

	expect(Product.safeParse(result).success).toBe(true)
	expect(result.id).toBe(productId)
	expect(result.recommendations).toBeNull()
})

test("products.list leaves recommendations and SEO out of every collection item", async () => {
	const result = await client().products.list.call({ query: { perPage: 100 } })

	expect(result.items.every((product) => product.recommendations === null)).toBe(true)
	expect(result.items.every((product) => product.seo === null)).toBe(true)
})

test("products.list optionally resolves recommendations for every collection item", async () => {
	const result = await client().products.list.call({ query: { slug: productSlug, recommendations: true } })
	const product = result.items[0]

	expect(product?.recommendations).toEqual({
		upsells: expect.any(Array),
		crossSells: expect.any(Array),
		related: expect.any(Array),
	})
	expect(product?.recommendations?.upsells.map((item) => item.slug)).toContain("test-product-2")
	expect(product?.recommendations?.crossSells.map((item) => item.slug)).toContain("test-product-3")
})

test("the REST v3 preview payload deserializes to the same complete Product", async () => {
	const response = await admin().woocommerce.products.retrieve({ id: productId })
	if (response.error) throw response.error

	const result = deserializeProduct(response.data)

	expect(Product.safeParse(result).success).toBe(true)
	expect(result.id).toBe(productId)
	expect(result.recommendations).toBeNull()
})

test("password-protected products redact descriptions and SEO", async () => {
	const result = await client().products.get.call({ params: { identifier: "test-product-locked" } })

	expect(result.isPasswordProtected).toBe(true)
	expect(result.description).toBe("")
	expect(result.shortDescription).toBe("")
	expect(result.seo).toBeNull()
})

test("products.get reports an unknown slug as a mapped error rather than resolving", async () => {
	await expect(client().products.get.call({ params: { identifier: "no-such-product-anywhere" } })).rejects.toThrow()
})

test("products.filters aggregates the collection through the generated endpoint", async () => {
	const result = await client().products.filters.call({ query: { perPage: 100, ratingCounts: true } })

	expect(result).not.toBeNull()
	expect(ProductFilters.safeParse(result).success).toBe(true)
	expect(result?.priceRange.maxPrice).toBeGreaterThanOrEqual(result?.priceRange.minPrice ?? 0)
	expect(Array.isArray(result?.ratingCounts)).toBe(true)
})

// ==================================================
// CART: wc/store/v1
// ==================================================

test("cart.get returns a cart conforming to Cart", async () => {
	await emptyCart()
	const result = await client().cart.get.call()

	expect(Cart.safeParse(result).success).toBe(true)
	expect(result.items).toHaveLength(0)
})

test("cart.items.add puts the product in the cart and answers with the whole cart", async () => {
	await emptyCart()
	const result = await client().cart.items.add.call({ body: { productId, quantity: 2 } })

	expect(Cart.safeParse(result).success).toBe(true)
	expect(result.items).toHaveLength(1)
	expect(result.items[0]?.productId).toBe(productId)
	expect(result.items[0]?.quantity).toBe(2)
	expect(result.items[0]?.url).not.toBeNull()
	expect(result.items[0]?.prices.salePrice).toBeNull()
	expect(result.items[0]?.custom).toEqual({ product_note: "Fixture product" })
	expect(result.crossSells.map((product) => product.slug)).toContain("test-product-3")
})

test("cart.items.add maps variation lines to base and variation IDs", async () => {
	await emptyCart()
	const result = await client().cart.items.add.call({
		body: {
			productId: variableProductId,
			variationId,
		},
	})

	expect(result.items).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				productId: variableProductId,
				variationId,
				quantity: 1,
				slug: "test-product-variable",
			}),
		]),
	)
	expect(result.items[0]?.custom).toEqual({ product_note: "Fixture product" })
})

test("the cart survives between calls, so the session header carries identity", async () => {
	await emptyCart()
	await client().cart.items.add.call({ body: { productId, quantity: 1 } })

	const result = await client().cart.get.call()

	expect(result.items).toHaveLength(1)
	expect(result.itemCount).toBe(1)
})

test("an API guest cart is available to a server-rendered storefront request", async () => {
	const apiUrl = "http://test.local/api/kizlo"
	const guestAuth = createAuthAdapter({ getSession: () => null })
	const guestApi = getKizloTestInstance({ baseUrl: apiUrl, integrations: [woocommerce()], adapters: { auth: guestAuth } })
	let guestSetCookie: string | undefined

	const browser = await getKizloClientTestInstance(guestApi, {
		url: apiUrl,
		fetch: async (request) => {
			const response = await guestApi.handler(request)
			guestSetCookie ??= response.headers.getSetCookie().find((header) => header.startsWith("guest-session="))
			return response
		},
	})
	const added = await browser.client.woocommerce.cart.items.add({ body: { productId, quantity: 1 } })

	expect(added.success).toBe(true)
	if (!added.success) throw added.error
	if (!guestSetCookie) throw new Error("The guest cart response set no session cookie.")
	expect(guestSetCookie).toContain("Path=/")
	expect(guestSetCookie).toContain("HttpOnly")
	expect(guestSetCookie).toContain("SameSite=Lax")
	expect(guestSetCookie).toContain("Max-Age=172800")

	const cookieHeader = guestSetCookie.split(";", 1)[0]
	if (!cookieHeader) throw new Error("The guest session cookie had no name/value pair.")
	const storefrontRequest = new Request("http://test.local/cart", { headers: { cookie: cookieHeader } })
	const storefrontCookies = guestApi.context.createRestContext(storefrontRequest).cookies
	const cookies: CookiesAdapter = {
		deleteAll: () => {},
		getAll: () => storefrontCookies.get(),
		setAll: () => {},
	}
	const storefront = getKizloTestInstance({ integrations: [woocommerce()], adapters: { auth: guestAuth, cookies } })

	const serverCart = await storefront.client.woocommerce.cart.get.call()
	expect(serverCart.items).toEqual(expect.arrayContaining([expect.objectContaining({ productId, quantity: 1 })]))

	await emptyCart()
	const signedInApi = getKizloTestInstance({ baseUrl: apiUrl, integrations: [woocommerce()] })
	const merged = await signedInApi.handler(new Request(`${apiUrl}/cart`, { headers: { cookie: cookieHeader } }))
	const deletedCookie = merged.headers.getSetCookie().find((header) => header.startsWith("guest-session="))

	expect(merged.status).toBe(200)
	expect(deletedCookie).toContain("Path=/")
	expect(deletedCookie).toContain("Max-Age=0")
	await emptyCart()
})

test("cart.items.add maps an unknown product to its Kizlo error", async () => {
	await expect(client().cart.items.add.call({ body: { productId: 99999999, quantity: 1 } })).rejects.toThrow()
})

test("cart.items.remove takes the item key WooCommerce assigned", async () => {
	await emptyCart()
	const added = await client().cart.items.add.call({ body: { productId, quantity: 1 } })
	const key = added.items[0]?.key ?? ""

	const result = await client().cart.items.remove.call({ params: { key } })

	expect(result.items).toHaveLength(0)
})

test("cart.items.update changes quantity through the shared cart serializer", async () => {
	await emptyCart()
	const added = await client().cart.items.add.call({ body: { productId, quantity: 1 } })
	const key = added.items[0]?.key ?? ""

	const result = await client().cart.items.update.call({ params: { key }, body: { quantity: 2 } })

	expect(result.items[0]).toMatchObject({ key, productId, quantity: 2 })
})

test("cart.update preserves omitted address fields and clears explicit empty values", async () => {
	await emptyCart()
	await client().cart.update.call({
		body: {
			shippingAddress: {
				firstName: "Stored",
				city: "Los Angeles",
				state: "CA",
				postcode: "90210",
				country: "US",
			},
		},
	})

	const updated = await client().cart.update.call({ body: { shippingAddress: { postcode: "10001", firstName: "" } } })

	expect(updated.shippingAddress).toMatchObject({ firstName: "", city: "Los Angeles", state: "CA", postcode: "10001", country: "US" })
})

test("cart.selectShippingRate accepts and returns the package identifier", async () => {
	await emptyCart()
	await client().cart.items.add.call({ body: { productId, quantity: 1 } })
	const addressed = await client().cart.update.call({
		body: { shippingAddress: { city: "Los Angeles", state: "CA", postcode: "90210", country: "US" } },
	})
	const shippingPackage = addressed.shippingPackages[0]
	const rate = shippingPackage?.rates[0]
	if (!shippingPackage || !rate) throw new Error("The woocommerce fixture exposed no shipping rate.")

	const selected = await client().cart.selectShippingRate.call({ body: { rateId: rate.id, packageId: shippingPackage.id } })

	expect(selected.shippingPackages.flatMap((pkg) => pkg.rates)).toEqual(
		expect.arrayContaining([expect.objectContaining({ id: rate.id, selected: true })]),
	)
})

test("cart.coupons.apply and remove round-trip the seeded coupon", async () => {
	await emptyCart()
	await client().cart.items.add.call({ body: { productId, quantity: 1 } })

	const applied = await client().cart.coupons.apply.call({ body: { code: "test10" } })
	expect(applied.coupons.map((coupon) => coupon.code)).toContain("test10")

	const removed = await client().cart.coupons.remove.call({ params: { code: "test10" } })
	expect(removed.coupons).toHaveLength(0)
})

test("cart.coupons.apply maps an unknown coupon to its Kizlo error", async () => {
	await emptyCart()
	await client().cart.items.add.call({ body: { productId, quantity: 1 } })

	await expect(client().cart.coupons.apply.call({ body: { code: "NOT-A-COUPON" } })).rejects.toThrow()
})

// ==================================================
// CART: the arguments the contract calls required
// ==================================================

/**
 * The plugin marks the cart mutation arguments WooCommerce registers as optional and then reads in
 * the handler anyway, which is what stops `removeItem()` compiling. Nothing in TypeScript can check
 * that claim against WooCommerce, so these send each mutation without it and assert the failure. A
 * WooCommerce release that grows a default for one of them turns its case green in a way that reads
 * as an overlay to drop rather than a test to fix.
 *
 * These reach the generated endpoints rather than the integration's procedures, because the procedures
 * are the layer whose schemas already refuse the call.
 */
function store() {
	return kizlo.context.createServerContext().wordpress.woocommerce.store
}

/** What the session middleware sends, so these land on the same cart as the tests above. */
function session() {
	return { headers: { "X-Kizlo-User-Email": getTestCredentials().users.user.email } }
}

test("cart.addItem without a product cannot resolve one", async () => {
	const response = await store().cart.addItem({} as { id: number }, session())

	expect(response.error?.code).toBe("woocommerce_rest_cart_invalid_product")
})

test("cart.removeItem without a key matches no cart item", async () => {
	await emptyCart()
	await client().cart.items.add.call({ body: { productId, quantity: 1 } })

	const response = await store().cart.removeItem({} as { key: string }, session())

	expect(response.error?.code).toBe("woocommerce_rest_cart_invalid_key")
})

test("cart.updateItem without a key changes nothing it can name", async () => {
	await emptyCart()
	await client().cart.items.add.call({ body: { productId, quantity: 1 } })

	const response = await store().cart.updateItem({ quantity: 3 } as { key: string; quantity: number }, session())

	expect(response.error?.code).toBe("woocommerce_rest_cart_invalid_key")
})

test("cart.applyCoupon without a code applies no coupon", async () => {
	await emptyCart()
	await client().cart.items.add.call({ body: { productId, quantity: 1 } })

	const response = await store().cart.applyCoupon({} as { code: string }, session())

	expect(response.error?.code).toBe("woocommerce_rest_cart_coupon_error")
})

test("cart.removeCoupon without a code removes no coupon", async () => {
	await emptyCart()
	await client().cart.items.add.call({ body: { productId, quantity: 1 } })

	const response = await store().cart.removeCoupon({} as { code: string }, session())

	expect(response.error?.code).toBe("woocommerce_rest_cart_coupon_error")
})

/**
 * The other half of the overlay: `addItem` takes a quantity and a variation and is marked as
 * needing neither, because WooCommerce fills them. This is the call that would break if the overlay
 * were widened to every argument the handler reads.
 */
test("cart.addItem without a quantity takes the product's minimum", async () => {
	await emptyCart()
	const response = await store().cart.addItem({ id: productId }, session())

	expect(response.error).toBeNull()
	expect(response.data?.items_count).toBe(1)
})

/**
 * `addItem` is the one cart mutation WooCommerce answers `201` to, from `set_status( 201 )` in
 * `CartAddItem::get_route_post_response()`, and the contract declared `200` for all eight until
 * KIZ-106. A status is a discriminant a caller can narrow on, so it has to be the one the server
 * sends rather than the one the loop that built the declaration found convenient. The second call
 * is the other half: it pins a mutation that really is `200`, so a fix applied to the whole loop
 * rather than to the one operation fails here.
 */
test("cart.addItem reports the item it created with 201", async () => {
	await emptyCart()
	const response = await store().cart.addItem({ id: productId, quantity: 1 }, session())

	expect(response.error).toBeNull()
	expect(response.status).toBe(201)
	expect(response.data?.items_count).toBe(1)
})

test("cart.updateItem changes an item it did not create with 200", async () => {
	await emptyCart()
	const added = await store().cart.addItem({ id: productId, quantity: 1 }, session())
	const key = added.data?.items[0]?.key
	if (!key) throw new Error("cart.addItem returned no item to update.")

	const response = await store().cart.updateItem({ key, quantity: 2 }, session())

	expect(response.error).toBeNull()
	expect(response.status).toBe(200)
})

// ==================================================
// CHECKOUT: wc/store/v1
// ==================================================

test("checkout.get returns a checkout carrying the cart WooCommerce does not declare", async () => {
	await emptyCart()
	await client().cart.items.add.call({ body: { productId, quantity: 1 } })
	const cart = await client().cart.get.call()

	const result = await client().checkout.get.call()

	expect(Checkout.safeParse(result).success).toBe(true)
	// `__experimentalCart` is returned by both checkout responses and described by neither, so this
	// resolving at all is the hand-written half of the spec doing its job.
	expect(result.cart && Cart.safeParse(result.cart).success).toBe(true)
	expect(result.cart?.items).toEqual(cart.items)
})

test("checkout.confirm submits the caller's complete checkout and returns the created order", async () => {
	await emptyCart()
	await client().cart.items.add.call({ body: { productId, quantity: 1 } })
	const addressed = await client().cart.update.call({
		body: { shippingAddress: { city: "Los Angeles", state: "CA", postcode: "90210", country: "US" } },
	})
	const shippingPackage = addressed.shippingPackages[0]
	const rate = shippingPackage?.rates[0]
	if (!shippingPackage || !rate) throw new Error("The checkout fixture exposed no shipping rate.")
	await client().cart.selectShippingRate.call({ body: { packageId: shippingPackage.id, rateId: rate.id } })

	const result = await client().checkout.confirm.call({
		body: {
			billingAddress: {
				firstName: "Ada",
				lastName: "Lovelace",
				company: "",
				address1: "1 Store Street",
				address2: "",
				city: "Los Angeles",
				state: "CA",
				postcode: "90210",
				country: "US",
				phone: "0123456789",
				email: "ada@example.com",
				additionalFields: {},
			},
			shippingAddress: {
				firstName: "Ada",
				lastName: "Lovelace",
				company: "",
				address1: "1 Store Street",
				address2: "",
				city: "Los Angeles",
				state: "CA",
				postcode: "90210",
				country: "US",
				phone: "0123456789",
				additionalFields: {},
			},
			paymentMethod: "bacs",
			customerNote: "Created through Kizlo",
		},
	})

	expect(Checkout.safeParse(result).success).toBe(true)
	expect(result).toMatchObject({
		orderId: expect.any(Number),
		orderNumber: expect.any(String),
		orderKey: expect.any(String),
		customerNote: "Created through Kizlo",
		paymentMethod: "bacs",
		paymentResult: { status: "success", details: expect.any(Array), redirectUrl: expect.any(String) },
	})
})

/**
 * Retrying payment on an order that already exists, which is the one checkout call whose addresses
 * come from the caller rather than from the cart session.
 *
 * Each of these creates its own order, because a retry only works on an order still waiting to be
 * paid and a successful one is no longer that. They read the stored order back over the admin API
 * rather than trusting the response alone: what WooCommerce answers with and what it kept are the
 * same thing here only if the address actually landed on the order.
 *
 * Registered orders are authorized against the customer identity Kizlo forwards. Guest orders
 * continue to use their key and billing email, while an order belonging to any other registered
 * user must remain unavailable.
 */
const ORDER_EMAIL = "stored.shopper@example.com"

const STORED_SHIPPING = {
	first_name: "Stored",
	last_name: "Shopper",
	address_1: "1 Old Road",
	city: "Leeds",
	postcode: "LS1 1AA",
	country: "GB",
}

const RETRY_BILLING: CartBillingAddress = {
	firstName: "Retry",
	lastName: "Payer",
	company: "",
	email: "retry.payer@example.com",
	phone: "01610000000",
	address1: "12 Fallback Street",
	address2: "",
	city: "Manchester",
	postcode: "M1 1AA",
	state: "",
	country: "GB",
	additionalFields: {},
}

type SeededOrder = { id: number; order_key: string; shipping: typeof STORED_SHIPPING; status: string }

/** The admin-authenticated client the test instance is wired with, for the wc/v3 routes Kizlo has no procedure for. */
function admin() {
	return kizlo.context.createServerContext().wordpress
}

async function createPendingOrder(customerId = 0): Promise<SeededOrder> {
	const created = await admin().post<SeededOrder>(`${WC_CORE_BASE}/orders`, {
		body: {
			status: "pending",
			payment_method: "bacs",
			customer_id: customerId,
			billing: { ...STORED_SHIPPING, email: ORDER_EMAIL },
			shipping: STORED_SHIPPING,
			line_items: [{ product_id: productId, quantity: 1 }],
		},
	})
	if (created.error) throw created.error
	return created.data
}

async function storedOrder(id: number): Promise<SeededOrder> {
	const order = await admin().get<SeededOrder>(`${WC_CORE_BASE}/orders/${id}`, {})
	if (order.error) throw order.error
	return order.data
}

test("checkout.retry pays an order owned by the headless customer", async () => {
	const order = await createPendingOrder(getTestCredentials().users.user.id)

	await client().checkout.retry.call({
		params: { orderId: order.id },
		body: { key: order.order_key, billingEmail: ORDER_EMAIL, paymentMethod: "bacs", billingAddress: RETRY_BILLING },
	})

	const stored = await storedOrder(order.id)
	expect(stored.status).toBe("on-hold")
})

test("checkout.retry refuses an order owned by another registered user", async () => {
	const order = await createPendingOrder(getTestCredentials().users.admin.id)

	await expect(
		client().checkout.retry.call({
			params: { orderId: order.id },
			body: { key: order.order_key, billingEmail: ORDER_EMAIL, paymentMethod: "bacs", billingAddress: RETRY_BILLING },
		}),
	).rejects.toMatchObject({ code: "CHECKOUT_ORDER_FORBIDDEN", status: 403 })

	const stored = await storedOrder(order.id)
	expect(stored.status).toBe("pending")
})

test("checkout.retry leaves an absent shipping address off the call, so WooCommerce falls back to billing", async () => {
	const order = await createPendingOrder()

	const result = await client().checkout.retry.call({
		params: { orderId: order.id },
		body: { key: order.order_key, billingEmail: ORDER_EMAIL, paymentMethod: "bacs", billingAddress: RETRY_BILLING },
	})

	expect(result.billingAddress.address1).toBe(RETRY_BILLING.address1)
	// WooCommerce copies billing onto shipping only when the argument is absent, so a blank object
	// sent in its place would leave this holding the address the order already had, or fail
	// validation outright.
	expect(result.shippingAddress.address1).toBe(RETRY_BILLING.address1)
	expect(result.shippingAddress.city).toBe(RETRY_BILLING.city)

	const stored = await storedOrder(order.id)
	expect(stored.shipping.address_1).toBe(RETRY_BILLING.address1)
	expect(stored.shipping.postcode).toBe(RETRY_BILLING.postcode)
})

test("checkout.retry sends the shipping address a caller did give", async () => {
	const order = await createPendingOrder()
	const shippingAddress = { ...RETRY_BILLING, firstName: "Delivery", address1: "34 Separate Way", city: "Bristol", postcode: "BS1 1AA" }

	const result = await client().checkout.retry.call({
		params: { orderId: order.id },
		body: { key: order.order_key, billingEmail: ORDER_EMAIL, paymentMethod: "bacs", billingAddress: RETRY_BILLING, shippingAddress },
	})

	expect(result.shippingAddress.address1).toBe(shippingAddress.address1)
	expect(result.billingAddress.address1).toBe(RETRY_BILLING.address1)

	const stored = await storedOrder(order.id)
	expect(stored.shipping.address_1).toBe(shippingAddress.address1)
})

test("checkout.retry refuses a body with no billing address", async () => {
	const order = await createPendingOrder()
	const body = { key: order.order_key, billingEmail: ORDER_EMAIL, paymentMethod: "bacs" } as Omit<RetryCheckoutInput, "orderId">

	await expect(client().checkout.retry.call({ params: { orderId: order.id }, body })).rejects.toThrow()

	// The refusal is Kizlo's own, so nothing reached WooCommerce and the order still holds what it did.
	const stored = await storedOrder(order.id)
	expect(stored.shipping.address_1).toBe(STORED_SHIPPING.address_1)
})

// ==================================================
// ORDERS: wc/store/v1
// ==================================================

function guestClient() {
	const auth = createAuthAdapter({ getSession: () => null })
	return getKizloTestInstance({ integrations: [woocommerce()], adapters: { auth } }).client.woocommerce
}

test("orders.get returns an order to its registered owner", async () => {
	const order = await createPendingOrder(getTestCredentials().users.user.id)

	const result = await client().orders.get.call({ params: { orderId: order.id } })

	expect(Order.safeParse(result).success).toBe(true)
	expect(result.id).toBe(order.id)
	expect(result.status).toBe("pending")
	expect(result.items[0]).toMatchObject({ productId, product: { custom: { product_note: "Fixture product" } } })
	expect(result.items[0]).not.toHaveProperty("key")
	expect(result.items[0]?.product).not.toHaveProperty("permalink")
})

test("orders.get returns a guest order with its key and billing email", async () => {
	const order = await createPendingOrder()

	const result = await guestClient().orders.get.call({
		params: { orderId: order.id },
		query: { key: order.order_key, billingEmail: ORDER_EMAIL },
	})

	expect(Order.safeParse(result).success).toBe(true)
	expect(result.id).toBe(order.id)
})

test("orders.get refuses missing or incorrect guest credentials", async () => {
	const order = await createPendingOrder()
	const orders = guestClient().orders

	await expect(orders.get.call({ params: { orderId: order.id } })).rejects.toMatchObject({ code: "ORDER_FORBIDDEN", status: 403 })
	await expect(
		orders.get.call({ params: { orderId: order.id }, query: { key: "wc_order_wrong", billingEmail: ORDER_EMAIL } }),
	).rejects.toMatchObject({ code: "ORDER_FORBIDDEN", status: 403 })
	await expect(
		orders.get.call({ params: { orderId: order.id }, query: { key: order.order_key, billingEmail: "wrong@example.com" } }),
	).rejects.toMatchObject({ code: "ORDER_FORBIDDEN", status: 403 })
})

test("orders.get refuses a different registered owner", async () => {
	const order = await createPendingOrder(getTestCredentials().users.admin.id)

	await expect(client().orders.get.call({ params: { orderId: order.id } })).rejects.toMatchObject({
		code: "ORDER_FORBIDDEN",
		status: 403,
	})
})

test("orders.get maps a missing order without leaking its authorization path", async () => {
	await expect(client().orders.get.call({ params: { orderId: 99999999 } })).rejects.toMatchObject({
		code: "ORDER_NOT_FOUND",
		status: 404,
	})
})

test("orders.get keeps the transaction after its product is deleted", async () => {
	const createdProduct = await admin().post<{ id: number }>(`${WC_CORE_BASE}/products`, {
		body: { name: "Disposable order product", type: "simple", status: "publish", regular_price: "12" },
	})
	if (createdProduct.error) throw createdProduct.error

	const createdOrder = await admin().post<SeededOrder>(`${WC_CORE_BASE}/orders`, {
		body: {
			status: "pending",
			customer_id: getTestCredentials().users.user.id,
			billing: { ...STORED_SHIPPING, email: ORDER_EMAIL },
			shipping: STORED_SHIPPING,
			line_items: [{ product_id: createdProduct.data.id, quantity: 1 }],
		},
	})
	if (createdOrder.error) throw createdOrder.error

	const deleted = await admin().delete(`${WC_CORE_BASE}/products/${createdProduct.data.id}`, { searchParams: { force: true } })
	if (deleted.error) throw deleted.error

	const result = await client().orders.get.call({ params: { orderId: createdOrder.data.id } })

	expect(result.items[0]).toMatchObject({
		productId: createdProduct.data.id,
		name: "Disposable order product",
		quantity: 1,
		product: null,
	})
})

// ==================================================
// CUSTOMERS: wc/v3
// ==================================================

test("customers.get reads the signed-in customer through the generated endpoint", async () => {
	const creds = getTestCredentials()
	const result = await client().customers.get.call()

	expect(Customer.safeParse(result).success).toBe(true)
	expect(result.id).toBe(creds.users.user.id)
	expect(result.email).toBe(creds.users.user.email)
})

test("an email-authenticated cart add operates on the matching WordPress customer", async () => {
	const creds = getTestCredentials()
	await emptyCart()
	await client().cart.items.add.call({ body: { productId, quantity: 1 } })

	// The cart add and the customer read share one identity: the email the session forwards, resolved
	// to the seeded WordPress user, not any numeric id the caller supplied.
	const customer = await client().customers.get.call()
	expect(customer.id).toBe(creds.users.user.id)
	expect(customer.email).toBe(creds.users.user.email)

	const cart = await client().cart.get.call()
	expect(cart.items).toEqual(expect.arrayContaining([expect.objectContaining({ productId, quantity: 1 })]))
	await emptyCart()
})
