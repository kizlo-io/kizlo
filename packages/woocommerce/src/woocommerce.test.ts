import { getKizloTestInstance, getTestCredentials } from "kizlo/test-harness"
import { afterAll, beforeAll, expect, test } from "vitest"
import { Cart } from "./cart/schema"
import { Checkout, type RetryCheckoutInput } from "./checkout/schema"
import { WC_CORE_BASE } from "./constants"
import { Customer } from "./customer/schema"
import { woocommerce } from "./index"
import { Product, ProductFilters, ProductList } from "./product/schema"
import type { BillingAddress } from "./schema"

/**
 * The WooCommerce extension against a real WooCommerce, calling every route through the endpoints
 * the plugin describes and the generator emits.
 *
 * These reach WooCommerce over HTTP, so they are a check on the contract as much as on the
 * procedures: a spec that mistypes an argument fails here, where a spec that merely compiles does
 * not. That is the point of having them at all.
 *
 * The cart is keyed to the signed-in test user rather than a guest token, because a direct
 * `.call()` gets the server context and its cookie storage has no adapter behind it. The
 * `X-Kizlo-User-Id` header the middleware sends instead is what carries identity between the calls
 * below, so a cart that survives from one test to the next is that header working.
 */
let kizlo: ReturnType<typeof instance>
let productId = 0
let productSlug = ""

function instance() {
	return getKizloTestInstance({ extensions: [woocommerce()] })
}

beforeAll(async () => {
	kizlo = instance()

	const products = await client().products.list.call({ query: { perPage: 100 } })
	const seeded = products.items.find((item) => item.slug.startsWith("test-product-"))
	if (!seeded) throw new Error("The woocommerce fixture seeded no products.")

	productId = seeded.id
	productSlug = seeded.slug
})

afterAll(async () => {
	// The fixture's cleanup empties the cart between runs, but leaving one behind would make the
	// first assertion of the next run depend on which test ran last here.
	await emptyCart()
})

/** The extension's routers, so the tests below read as calls rather than as lookups. */
function client() {
	return kizlo.client.woocommerce
}

async function emptyCart(): Promise<void> {
	const cart = await client().cart.get.call()
	for (const item of cart?.lineItems ?? []) {
		await client().cart.items.remove.call({ params: { key: item.key } })
	}
}

// ==================================================
// PRODUCTS — wc/store/v1 and wc/v3
// ==================================================

test("products.list reads the Store API through the generated endpoint", async () => {
	const result = await client().products.list.call({ query: { perPage: 5 } })

	expect(ProductList.safeParse(result).success).toBe(true)
	expect(result.items.length).toBeGreaterThan(0)
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

test("products.get resolves a product by slug through the REST v3 list", async () => {
	const result = await client().products.get.call({ params: { identifier: productSlug } })

	expect(Product.safeParse(result).success).toBe(true)
	expect(result.id).toBe(productId)
	// Every field here comes from the `kizlo` block the plugin's response filter adds, which no
	// WooCommerce schema mentions and the spec therefore declares by hand.
	expect(result.currencyFormat.currencyCode).toBeTruthy()
	expect(Array.isArray(result.attributes)).toBe(true)
	expect(typeof result.prices.regularPrice).toBe("number")
})

test("products.get reports an unknown slug as a mapped error rather than resolving", async () => {
	await expect(client().products.get.call({ params: { identifier: "no-such-product-anywhere" } })).rejects.toThrow()
})

test("products.filters aggregates the collection through the generated endpoint", async () => {
	const result = await client().products.filters.call({ query: { perPage: 100 } })

	expect(result).not.toBeNull()
	expect(ProductFilters.safeParse(result).success).toBe(true)
	expect(result?.priceRange.maxPrice).toBeGreaterThanOrEqual(result?.priceRange.minPrice ?? 0)
})

// ==================================================
// CART — wc/store/v1
// ==================================================

test("cart.get returns a cart conforming to Cart", async () => {
	await emptyCart()
	const result = await client().cart.get.call()

	expect(Cart.nullable().safeParse(result).success).toBe(true)
	expect(result?.lineItems).toHaveLength(0)
})

test("cart.items.add puts the product in the cart and answers with the whole cart", async () => {
	await emptyCart()
	const result = await client().cart.items.add.call({ body: { productId, quantity: 2 } })

	expect(Cart.safeParse(result).success).toBe(true)
	expect(result.lineItems).toHaveLength(1)
	expect(result.lineItems[0]?.productId).toBe(productId)
	expect(result.lineItems[0]?.quantity).toBe(2)
})

test("the cart survives between calls, so the session header carries identity", async () => {
	await emptyCart()
	await client().cart.items.add.call({ body: { productId, quantity: 1 } })

	const result = await client().cart.get.call()

	expect(result?.lineItems).toHaveLength(1)
	expect(result?.totalItems).toBe(1)
})

test("cart.items.add maps an unknown product to its Kizlo error", async () => {
	await expect(client().cart.items.add.call({ body: { productId: 99999999, quantity: 1 } })).rejects.toThrow()
})

test("cart.items.remove takes the item key WooCommerce assigned", async () => {
	await emptyCart()
	const added = await client().cart.items.add.call({ body: { productId, quantity: 1 } })
	const key = added.lineItems[0]?.key ?? ""

	const result = await client().cart.items.remove.call({ params: { key } })

	expect(result.lineItems).toHaveLength(0)
})

test("cart.coupons.apply and remove round-trip the seeded coupon", async () => {
	await emptyCart()
	await client().cart.items.add.call({ body: { productId, quantity: 1 } })

	const applied = await client().cart.coupons.apply.call({ body: { code: "test10" } })
	expect(applied.couponLines.map((line) => line.code)).toContain("test10")

	const removed = await client().cart.coupons.remove.call({ params: { code: "test10" } })
	expect(removed.couponLines).toHaveLength(0)
})

test("cart.coupons.apply maps an unknown coupon to its Kizlo error", async () => {
	await emptyCart()
	await client().cart.items.add.call({ body: { productId, quantity: 1 } })

	await expect(client().cart.coupons.apply.call({ body: { code: "NOT-A-COUPON" } })).rejects.toThrow()
})

// ==================================================
// CART — the arguments the contract calls required
// ==================================================

/**
 * The plugin marks the cart mutation arguments WooCommerce registers as optional and then reads in
 * the handler anyway, which is what stops `remove_item()` compiling. Nothing in TypeScript can check
 * that claim against WooCommerce, so these send each mutation without it and assert the failure. A
 * WooCommerce release that grows a default for one of them turns its case green in a way that reads
 * as an overlay to drop rather than a test to fix.
 *
 * These reach the generated endpoints rather than the extension's procedures, because the procedures
 * are the layer whose schemas already refuse the call.
 */
function store() {
	return kizlo.context.createServerContext().wordpress.woocommerce.store
}

/** What the session middleware sends, so these land on the same cart as the tests above. */
function session() {
	return { headers: { "X-Kizlo-User-Id": String(getTestCredentials().users.user.id) } }
}

test("cart.add_item without a product cannot resolve one", async () => {
	const response = await store().cart.add_item({} as { id: number }, session())

	expect(response.error?.code).toBe("woocommerce_rest_cart_invalid_product")
})

test("cart.remove_item without a key matches no cart item", async () => {
	await emptyCart()
	await client().cart.items.add.call({ body: { productId, quantity: 1 } })

	const response = await store().cart.remove_item({} as { key: string }, session())

	expect(response.error?.code).toBe("woocommerce_rest_cart_invalid_key")
})

test("cart.update_item without a key changes nothing it can name", async () => {
	await emptyCart()
	await client().cart.items.add.call({ body: { productId, quantity: 1 } })

	const response = await store().cart.update_item({ quantity: 3 } as { key: string; quantity: number }, session())

	expect(response.error?.code).toBe("woocommerce_rest_cart_invalid_key")
})

test("cart.apply_coupon without a code applies no coupon", async () => {
	await emptyCart()
	await client().cart.items.add.call({ body: { productId, quantity: 1 } })

	const response = await store().cart.apply_coupon({} as { code: string }, session())

	expect(response.error?.code).toBe("woocommerce_rest_cart_coupon_error")
})

test("cart.remove_coupon without a code removes no coupon", async () => {
	await emptyCart()
	await client().cart.items.add.call({ body: { productId, quantity: 1 } })

	const response = await store().cart.remove_coupon({} as { code: string }, session())

	expect(response.error?.code).toBe("woocommerce_rest_cart_coupon_error")
})

/**
 * The other half of the overlay: `add_item` takes a quantity and a variation and is marked as
 * needing neither, because WooCommerce fills them. This is the call that would break if the overlay
 * were widened to every argument the handler reads.
 */
test("cart.add_item without a quantity takes the product's minimum", async () => {
	await emptyCart()
	const response = await store().cart.add_item({ id: productId }, session())

	expect(response.error).toBeNull()
	expect(response.data?.items_count).toBe(1)
})

/**
 * `add_item` is the one cart mutation WooCommerce answers `201` to, from `set_status( 201 )` in
 * `CartAddItem::get_route_post_response()`, and the contract declared `200` for all eight until
 * KIZ-106. A status is a discriminant a caller can narrow on, so it has to be the one the server
 * sends rather than the one the loop that built the declaration found convenient. The second call
 * is the other half: it pins a mutation that really is `200`, so a fix applied to the whole loop
 * rather than to the one operation fails here.
 */
test("cart.add_item reports the item it created with 201", async () => {
	await emptyCart()
	const response = await store().cart.add_item({ id: productId, quantity: 1 }, session())

	expect(response.error).toBeNull()
	expect(response.status).toBe(201)
	expect(response.data?.items_count).toBe(1)
})

test("cart.update_item changes an item it did not create with 200", async () => {
	await emptyCart()
	const added = await store().cart.add_item({ id: productId, quantity: 1 }, session())
	const key = added.data?.items[0]?.key
	if (!key) throw new Error("cart.add_item returned no item to update.")

	const response = await store().cart.update_item({ key, quantity: 2 }, session())

	expect(response.error).toBeNull()
	expect(response.status).toBe(200)
})

// ==================================================
// CHECKOUT — wc/store/v1
// ==================================================

test("checkout.get returns a checkout carrying the cart WooCommerce does not declare", async () => {
	await emptyCart()
	await client().cart.items.add.call({ body: { productId, quantity: 1 } })

	const result = await client().checkout.get.call()

	expect(Checkout.safeParse(result).success).toBe(true)
	// `__experimentalCart` is returned by both checkout responses and described by neither, so this
	// resolving at all is the hand-written half of the spec doing its job.
	expect(result.cart?.lineItems).toHaveLength(1)
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
 * The orders are guest orders, verified by key and billing email. An order owned by a registered
 * customer cannot be retried through Kizlo at all: WooCommerce checks the owner in the route's
 * permission callback, which runs before the plugin switches the request to the cart user, so the
 * check sees the application-password admin and answers 403.
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

const RETRY_BILLING: BillingAddress = {
	firstName: "Retry",
	lastName: "Payer",
	email: "retry.payer@example.com",
	phone: "01610000000",
	address1: "12 Fallback Street",
	city: "Manchester",
	postcode: "M1 1AA",
	state: "",
	country: "GB",
}

type SeededOrder = { id: number; order_key: string; shipping: typeof STORED_SHIPPING }

/** The admin-authenticated client the test instance is wired with, for the wc/v3 routes Kizlo has no procedure for. */
function admin() {
	return kizlo.context.createServerContext().wordpress
}

async function createPendingOrder(): Promise<SeededOrder> {
	const created = await admin().post<SeededOrder>(`${WC_CORE_BASE}/orders`, {
		body: {
			status: "pending",
			payment_method: "bacs",
			customer_id: 0,
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
// CUSTOMERS — wc/v3
// ==================================================

test("customers.get reads the signed-in customer through the generated endpoint", async () => {
	const creds = getTestCredentials()
	const result = await client().customers.get.call()

	expect(Customer.safeParse(result).success).toBe(true)
	expect(result.id).toBe(creds.users.user.id)
	expect(result.email).toBe(creds.users.user.email)
})
