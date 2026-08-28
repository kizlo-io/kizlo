import { type DevPluginSource, defineFixture, kizloRelease, type SeedContext, type SettleContext } from "kizlo/test"
import { WC_CORE_BASE, WC_STORE_BASE } from "../constants"
import type { WC_Product, WC_ProductCreateInput } from "../product/types.wc"

type SeedProduct = Pick<WC_ProductCreateInput, "slug" | "name" | "regular_price"> &
	Partial<Pick<WC_ProductCreateInput, "description" | "post_password" | "short_description">>

const PRODUCTS: SeedProduct[] = [
	{ slug: "test-product-1", name: "Test Product 1", regular_price: "10" },
	{ slug: "test-product-2", name: "Test Product 2", regular_price: "20" },
	{ slug: "test-product-3", name: "Test Product 3", regular_price: "30" },
	{ slug: "test-product-4", name: "Test Product 4", regular_price: "40" },
	{ slug: "test-product-5", name: "Test Product 5", regular_price: "50" },
	{
		slug: "test-product-locked",
		name: "Test Product Locked",
		regular_price: "60",
		description: "Private product description",
		short_description: "Private product summary",
		post_password: "secret",
	},
]

const COUPONS = [{ code: "TEST10", discount_type: "percent", amount: "10" }]

async function upsertProduct(service: SeedContext["service"], product: SeedProduct): Promise<number> {
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

async function upsertProductCategory(service: SeedContext["service"]): Promise<number> {
	const existing = await service.get<Array<{ id: number }>>(`${WC_CORE_BASE}/products/categories`, {
		searchParams: { slug: "test-product-category" },
	})
	if (existing.data?.[0]) return existing.data[0].id

	const created = await service.post<{ id: number }>(`${WC_CORE_BASE}/products/categories`, {
		body: { name: "Test Product Category", slug: "test-product-category" },
	})
	if (created.error) throw created.error
	return created.data.id
}

async function linkProductCategory(service: SeedContext["service"], productId: number): Promise<void> {
	const categoryId = await upsertProductCategory(service)
	const updated = await service.put(`${WC_CORE_BASE}/products/${productId}`, {
		body: { categories: [{ id: categoryId }] },
	})
	if (updated.error) throw updated.error
}

async function linkRecommendations(service: SeedContext["service"], productIds: number[]): Promise<void> {
	const [productId, upsellId, crossSellId] = productIds
	if (!productId || !upsellId || !crossSellId) return

	const updated = await service.put(`${WC_CORE_BASE}/products/${productId}`, {
		body: { upsell_ids: [upsellId], cross_sell_ids: [crossSellId] },
	})
	if (updated.error) throw updated.error
}

/**
 * WooCommerce ships every gateway disabled, and paying an order needs an available one, so the
 * checkout tests have nothing to reach without this. Bank transfer is the gateway with no shipping
 * method or country conditions attached to it, so enabling it says the least about the rest.
 */
async function enableBankTransfer(service: SeedContext["service"]): Promise<void> {
	const updated = await service.put(`${WC_CORE_BASE}/payment_gateways/bacs`, { body: { enabled: true } })
	if (updated.error) throw updated.error
}

/**
 * WooCommerce bundles Action Scheduler, which keeps its actions in the posts table until it
 * migrates to its own tables, and registers two global post statuses (`in-progress`, `failed`)
 * for as long as that legacy store is live. The migration is scheduled a minute after activation
 * and left to cron, so a WordPress reports those two statuses for roughly its first minute and
 * never again. Every post type's status enum is built from the global list, so a client generated
 * inside that window carries two statuses that one generated outside it does not.
 *
 * Firing Action Scheduler's own migration callback settles it: the runner finds nothing to move
 * on a fresh install and marks the migration complete itself, so this is its cron path run now
 * rather than its bookkeeping written by hand.
 */
async function settleActionScheduler(wpEval: SettleContext["wpEval"]): Promise<void> {
	await wpEval(
		'if (class_exists("ActionScheduler_DataController") && !ActionScheduler_DataController::is_migration_complete()) { do_action("action_scheduler/migration_hook"); }',
	)
}

/**
 * WooCommerce test fixture: installs WooCommerce + the kizlo-woocommerce plugin, seeds
 * products/coupons. Pass `plugins` to override the defaults — e.g. bind-mount your local
 * source with `{ path: "plugins/kizlo-woocommerce" }` to develop/test against live files.
 */
export function woocommerce(opts: { plugins?: DevPluginSource[] } = {}) {
	return defineFixture({
		name: "woocommerce",
		plugins: opts.plugins ?? [
			"woocommerce",
			{
				name: "kizlo-woocommerce",
				source: kizloRelease("kizlo-woocommerce"),
			},
		],
		async settle({ wpEval }) {
			await settleActionScheduler(wpEval)
		},
		async seed({ service }) {
			let productId = 0
			const productIds: number[] = []
			for (const product of PRODUCTS) {
				const id = await upsertProduct(service, product)
				productIds.push(id)
				if (!productId) productId = id
			}
			if (productIds[0]) await linkProductCategory(service, productIds[0])
			await linkRecommendations(service, productIds)
			for (const coupon of COUPONS) await upsertCoupon(service, coupon)
			await enableBankTransfer(service)
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
