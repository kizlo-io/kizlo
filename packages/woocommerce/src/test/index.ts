import { WC_CORE_BASE, WC_STORE_BASE } from "kizlo"
import { defineFixture, githubRelease, type SeedContext } from "kizlo/test"
import type { WC_Product, WC_ProductCreateInput } from "../product/types.wc"

const PRODUCTS: Array<Pick<WC_ProductCreateInput, "slug" | "name" | "regular_price">> = [
	{ slug: "test-product-1", name: "Test Product 1", regular_price: "10" },
	{ slug: "test-product-2", name: "Test Product 2", regular_price: "20" },
	{ slug: "test-product-3", name: "Test Product 3", regular_price: "30" },
	{ slug: "test-product-4", name: "Test Product 4", regular_price: "40" },
	{ slug: "test-product-5", name: "Test Product 5", regular_price: "50" },
]

const COUPONS = [{ code: "TEST10", discount_type: "percent", amount: "10" }]

async function upsertProduct(service: SeedContext["service"], product: (typeof PRODUCTS)[number]): Promise<number> {
	const existing = await service.get<WC_Product[]>(`${WC_CORE_BASE}/products`, { searchParams: { slug: product.slug } })
	if (existing.data?.[0]) return existing.data[0].id

	const created = await service.post<WC_Product>(`${WC_CORE_BASE}/products`, {
		body: { ...product, type: "simple", status: "publish" } satisfies WC_ProductCreateInput,
	})
	if (created.error) throw created.error
	return created.data.id
}

async function upsertCoupon(service: SeedContext["service"], coupon: (typeof COUPONS)[number]): Promise<void> {
	const existing = await service.get<Array<{ id: number }>>(`${WC_CORE_BASE}/coupons`, { searchParams: { code: coupon.code } })
	if (existing.data?.[0]) return

	const created = await service.post(`${WC_CORE_BASE}/coupons`, { body: coupon })
	if (created.error) throw created.error
}

/** WooCommerce test fixture: installs WooCommerce + the kizlo-woocommerce plugin, seeds products/coupons. */
export function woocommerce() {
	return defineFixture({
		name: "woocommerce",
		plugins: [
			"woocommerce",
			{
				name: "kizlo-woocommerce",
				source: githubRelease("kizlo-io/kizlo-wordpress", "kizlo-woocommerce-v1.0.0-beta.2"),
			},
		],
		async seed({ service }) {
			let productId = 0
			for (const product of PRODUCTS) {
				const id = await upsertProduct(service, product)
				if (!productId) productId = id
			}
			for (const coupon of COUPONS) await upsertCoupon(service, coupon)
			return { productId }
		},
		async cleanup({ service, userId }) {
			await deleteAllOrdersFor(service, userId)
			await resetCart(service, userId)
		},
	})
}

async function deleteAllOrdersFor(service: SeedContext["service"], customerId: number): Promise<void> {
	const orders = await service.get<Array<{ id: number }>>(`${WC_CORE_BASE}/orders`, {
		searchParams: { customer: customerId, per_page: 100 },
	})
	if (!orders.data) return
	await Promise.all(orders.data.map((o) => service.delete(`${WC_CORE_BASE}/orders/${o.id}`, { searchParams: { force: true } })))
}

async function resetCart(service: SeedContext["service"], customerId: number): Promise<void> {
	await service.delete(`${WC_STORE_BASE}/cart/items`, {
		headers: { "X-Kizlo-User-Id": String(customerId) },
	})
}
