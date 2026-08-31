import { describe, expect, test } from "vitest"
import type { WCSK_Order, WCSK_OrderItem } from "./types"
import { deserializeOrder } from "./utils"

const currency = {
	currency_code: "GBP",
	currency_symbol: "£",
	currency_minor_unit: 2,
	currency_decimal_separator: ".",
	currency_thousand_separator: ",",
	currency_prefix: "£",
	currency_suffix: "",
}

function orderItem(options: { id: number; productId: number; variationId?: number; exists?: boolean; onSale?: boolean }): WCSK_OrderItem {
	const variationId = options.variationId ?? 0
	const exists = options.exists ?? true

	return {
		id: options.id,
		key: "wc_order_access_key_repeated_across_items",
		quantity: variationId ? 2 : 1.5,
		quantity_limits: { minimum: 1, maximum: 1, multiple_of: 1, editable: false },
		name: variationId ? "Snapshot variation" : "Snapshot simple product",
		short_description: exists ? "<p>Current short description</p>" : "",
		description: exists ? "<p>Current description</p>" : "",
		sku: exists ? (variationId ? "VAR-SKU" : "SIMPLE-SKU") : "",
		low_stock_remaining: null,
		backorders_allowed: false,
		show_backorder_badge: false,
		sold_individually: false,
		permalink: "https://wordpress.test/product/transport-only",
		images: exists
			? [
					{
						id: 9,
						src: "https://wordpress.test/image.jpg",
						thumbnail: "https://wordpress.test/image-300.jpg",
						srcset: "https://wordpress.test/image.jpg 1000w",
						thumbnail_srcset: "https://wordpress.test/image-300.jpg 300w",
						sizes: "100vw",
						thumbnail_sizes: "300px",
						name: "Product image",
						alt: "Product alt",
					},
				]
			: [],
		variation: variationId ? [{ attribute: "Size", raw_attribute: "pa_size", value: "Large" }] : [],
		item_data: [{ name: "Gift message", value: "Happy birthday", display: null }],
		prices: {
			...currency,
			price: options.onSale ? "900" : "1200",
			regular_price: "1200",
			sale_price: options.onSale ? "900" : "1200",
			price_range: options.onSale ? { min_amount: "800", max_amount: "900" } : null,
			raw_prices: { precision: 6, price: "900000", regular_price: "1200000", sale_price: "900000" },
		},
		totals: {
			...currency,
			line_subtotal: "1800",
			line_subtotal_tax: "360",
			line_total: "1500",
			line_total_tax: "300",
		},
		catalog_visibility: "visible",
		extensions: {
			"third-party": { opaque: true, zero: 0 },
			kizlo: {
				product_id: options.productId,
				variation_id: variationId,
				product_exists: exists,
				slug: exists ? "current-product" : "",
				url: exists ? "https://shop.test/products/current-product" : null,
				custom: exists ? { product_note: "Current note" } : { product_note: "" },
			},
		},
	}
}

function rawOrder(): WCSK_Order {
	return {
		id: 42,
		status: "wc-awaiting-pickup",
		items: [orderItem({ id: 101, productId: 7 }), orderItem({ id: 102, productId: 7, variationId: 8, onSale: true })],
		coupons: [
			{
				code: "SAVE",
				discount_type: "percent",
				totals: { ...currency, total_discount: "300", total_discount_tax: "60" },
			},
		],
		fees: [{ key: 501, name: "Handling", totals: { ...currency, total: "0", total_tax: "0" } }],
		billing_address: {
			first_name: "Ada",
			last_name: "Lovelace",
			company: "",
			address_1: "1 Example Road",
			address_2: "",
			city: "London",
			state: "",
			postcode: "SW1A 1AA",
			country: "GB",
			email: "ada@example.com",
			phone: "",
			vat_number: "GB123",
			leave_at_door: false,
		},
		shipping_address: {
			first_name: "Ada",
			last_name: "Lovelace",
			company: "",
			address_1: "1 Example Road",
			address_2: "",
			city: "London",
			state: "",
			postcode: "SW1A 1AA",
			country: "GB",
			phone: "",
			delivery_note: "",
		},
		needs_payment: false,
		needs_shipping: true,
		payment_requirements: ["products", "future-requirement"],
		errors: [{ code: "woocommerce_rest_product_out_of_stock", message: "An ordered item is unavailable." }],
		totals: {
			...currency,
			subtotal: "3600",
			total_items: "3000",
			total_items_tax: "600",
			total_fees: "0",
			total_fees_tax: "0",
			total_discount: "300",
			total_discount_tax: "60",
			total_shipping: null,
			total_shipping_tax: null,
			total_tax: "540",
			total_refund: "100",
			total_price: "3240",
			tax_lines: [{ name: "VAT", price: "540", rate: "20%" }],
		},
	}
}

describe("deserializeOrder", () => {
	test("normalizes the transaction and current product enrichment without leaking credentials", () => {
		const result = deserializeOrder(rawOrder())

		expect(result).toMatchObject({
			id: 42,
			status: "wc-awaiting-pickup",
			needsPayment: false,
			needsShipping: true,
			paymentRequirements: ["products", "future-requirement"],
			coupons: [{ code: "SAVE", discountType: "percent", totals: { discount: 300, discountTax: 60 } }],
			fees: [{ id: 501, name: "Handling", totals: { total: 0, tax: 0 } }],
			totals: {
				subtotal: 3600,
				itemsTotal: 3000,
				itemsTaxTotal: 600,
				feesTotal: 0,
				feesTaxTotal: 0,
				discountTotal: 300,
				discountTaxTotal: 60,
				shippingTotal: null,
				shippingTaxTotal: null,
				taxTotal: 540,
				refundTotal: 100,
				total: 3240,
				taxLines: [{ name: "VAT", price: 540, rate: "20%" }],
			},
			currencyFormat: { currencyCode: "GBP", currencySymbol: "£", currencyMinorUnit: 2 },
		})
		expect(result.billingAddress).toMatchObject({
			company: "",
			phone: "",
			additionalFields: { vat_number: "GB123", leave_at_door: false },
		})
		expect(result.shippingAddress.additionalFields).toEqual({ delivery_note: "" })
		expect(result.items[0]).toMatchObject({
			id: 101,
			productId: 7,
			variationId: null,
			quantity: 1.5,
			selectedAttributes: [],
			itemData: [{ name: "Gift message", value: "Happy birthday", display: null }],
			totals: { subtotal: 1800, subtotalTax: 360, total: 1500, totalTax: 300 },
			extensions: { "third-party": { opaque: true, zero: 0 } },
			product: {
				sku: "SIMPLE-SKU",
				slug: "current-product",
				url: "https://shop.test/products/current-product",
				prices: { price: 1200, regularPrice: 1200, salePrice: null, priceRange: null },
				custom: { product_note: "Current note" },
			},
		})
		expect(result.items[1]).toMatchObject({
			productId: 7,
			variationId: 8,
			selectedAttributes: [{ name: "Size", attribute: "pa_size", value: "Large" }],
			product: { prices: { price: 900, regularPrice: 1200, salePrice: 900, priceRange: { minAmount: 800, maxAmount: 900 } } },
		})
		expect(result.items[0]).not.toHaveProperty("key")
		expect(result.items[0]?.product).not.toHaveProperty("permalink")
	})

	test("keeps stored line data when the current product was deleted", () => {
		const raw = rawOrder()
		raw.items = [orderItem({ id: 103, productId: 44, variationId: 45, exists: false })]

		const result = deserializeOrder(raw)

		expect(result.items[0]).toMatchObject({
			id: 103,
			productId: 44,
			variationId: 45,
			name: "Snapshot variation",
			quantity: 2,
			itemData: [{ name: "Gift message", value: "Happy birthday", display: null }],
			product: null,
			extensions: { "third-party": { opaque: true, zero: 0 } },
		})
	})

	test("preserves zero and empty collections", () => {
		const raw = rawOrder()
		raw.items = []
		raw.coupons = []
		raw.fees = []
		raw.errors = []
		raw.payment_requirements = []
		raw.totals.total_price = "0"

		const result = deserializeOrder(raw)

		expect(result.items).toEqual([])
		expect(result.coupons).toEqual([])
		expect(result.fees).toEqual([])
		expect(result.errors).toEqual([])
		expect(result.paymentRequirements).toEqual([])
		expect(result.totals.total).toBe(0)
	})
})
