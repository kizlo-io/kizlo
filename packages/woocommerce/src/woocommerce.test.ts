import { getKizloTestInstance, getTestCredentials } from "kizlo/test-harness"
import { afterAll, beforeAll, expect, test } from "vitest"
import { Cart } from "./cart/schema"
import { Checkout } from "./checkout/schema"
import { Customer } from "./customer/schema"
import { woocommerce } from "./index"
import { Product, ProductFilters, ProductList } from "./product/schema"

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
