import { expect, test } from "vitest"
import type { WCK_Product, WCSK_Product } from "./types"
import { deserializeProduct, deserializeStoreProduct } from "./utils"

const currency = {
	currency_code: "USD",
	currency_symbol: "$",
	currency_prefix: "$",
	currency_suffix: "",
	currency_minor_unit: 2,
	currency_decimal_separator: ".",
	currency_thousand_separator: ",",
}

function restProduct(overrides: Record<string, unknown> = {}): WCK_Product {
	return {
		id: 1,
		type: "simple",
		slug: "dated-product",
		name: "Dated product",
		sku: "",
		description: "",
		short_description: "",
		date_on_sale_from: "2026-01-02T08:34:05",
		date_on_sale_from_gmt: "2026-01-02T03:04:05",
		date_on_sale_to: "2026-02-03T09:35:06",
		date_on_sale_to_gmt: "2026-02-03T04:05:06",
		sold_individually: false,
		low_stock_amount: null,
		stock_status: "instock",
		stock_quantity: null,
		images: [],
		categories: [],
		tags: [],
		average_rating: "0",
		rating_count: 0,
		grouped_products: [],
		backordered: false,
		purchasable: true,
		on_sale: true,
		parent_id: 0,
		brands: [],
		meta_data: [],
		kizlo: {
			prices: { price: 100, sale_price: 80, regular_price: 100 },
			attributes: [],
			variations: [],
			currency_format: currency,
		},
		...overrides,
	} as unknown as WCK_Product
}

function storeProduct(onSaleFrom: string | null): WCSK_Product {
	return {
		id: 1,
		type: "simple",
		name: "Dated product",
		slug: "dated-product",
		sku: "",
		description: "",
		short_description: "",
		is_in_stock: true,
		review_count: 0,
		average_rating: "0",
		low_stock_remaining: null,
		sold_individually: false,
		prices: { ...currency, price: "100", sale_price: "80", regular_price: "100", price_range: null },
		images: [],
		categories: [],
		tags: [],
		attributes: [],
		brands: [],
		grouped_products: [],
		has_options: false,
		is_on_backorder: false,
		is_purchasable: true,
		on_sale: true,
		parent: 0,
		variations: [],
		extensions: { kizlo: { stock: null, on_sale_from: onSaleFrom, on_sale_to: null, hs_code: null } },
	} as unknown as WCSK_Product
}

test("core REST sale dates read the GMT fields in every host timezone", () => {
	const original = process.env.TZ
	const expected = Date.UTC(2026, 0, 2, 3, 4, 5)

	try {
		for (const timezone of ["UTC", "Asia/Kolkata"]) {
			process.env.TZ = timezone
			expect(deserializeProduct(restProduct()).onSaleFrom).toBe(expected)
		}
	} finally {
		if (original === undefined) delete process.env.TZ
		else process.env.TZ = original
	}
})

test("plugin sale dates require an explicit timezone", () => {
	expect(deserializeStoreProduct(storeProduct("2026-01-02T03:04:05+05:30")).onSaleFrom).toBe(Date.UTC(2026, 0, 1, 21, 34, 5))
	expect(deserializeStoreProduct(storeProduct("2026-01-02T03:04:05")).onSaleFrom).toBeNull()
	expect(deserializeStoreProduct(storeProduct("invalid")).onSaleFrom).toBeNull()
	expect(deserializeStoreProduct(storeProduct(null)).onSaleFrom).toBeNull()
})
