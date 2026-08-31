import { expect, test } from "vitest"
import { Cart } from "./schema"
import type { WCK_Cart } from "./types"
import { deserializeCart, serializeCartUpdateInput } from "./utils"

const currency = {
	currency_code: "USD",
	currency_symbol: "$",
	currency_minor_unit: 2,
	currency_decimal_separator: ".",
	currency_thousand_separator: ",",
	currency_prefix: "$",
	currency_suffix: "",
}

function rawCart(): WCK_Cart {
	const simpleItem: WCK_Cart["items"][number] = {
		key: "simple-key",
		id: 42,
		type: "simple",
		quantity: 1,
		quantity_limits: { minimum: 1, maximum: 10, multiple_of: 1, editable: true },
		name: "Repeated name",
		description: "Description",
		short_description: "Short description",
		sku: "",
		low_stock_remaining: 0,
		backorders_allowed: true,
		show_backorder_badge: false,
		sold_individually: false,
		permalink: "https://store.example/product/storefront-only",
		catalog_visibility: "visible",
		images: [
			{
				id: 7,
				src: "https://store.example/product.jpg",
				thumbnail: "https://store.example/thumb.jpg",
				srcset: "product.jpg 1x",
				sizes: "100vw",
				name: "Product",
				alt: "Product",
				thumbnail_srcset: "thumb.jpg 1x",
				thumbnail_sizes: "300px",
			},
		],
		variation: [],
		item_data: [{ name: "Gift", value: "yes", display: "Gift wrapped" }],
		prices: {
			...currency,
			price: "250",
			regular_price: "250",
			sale_price: "250",
			price_range: null,
			raw_prices: { precision: 6, price: "2500000", regular_price: "2500000", sale_price: "" },
		},
		totals: {
			...currency,
			line_subtotal: "250",
			line_subtotal_tax: "50",
			line_total: "200",
			line_total_tax: "40",
		},
		extensions: {
			kizlo: {
				product_id: 42,
				variation_id: 0,
				slug: "base-product",
				url: "https://frontend.example/products/base-product",
				custom: { product_note: "Typed note" },
			},
			acme: { opaque: true },
		},
	}

	return {
		items: [
			simpleItem,
			{
				...simpleItem,
				key: "variation-key",
				id: 77,
				quantity: 1.5,
				low_stock_remaining: null,
				variation: [{ attribute: "Size", raw_attribute: "attribute_pa_size", value: "Large" }],
				item_data: [{ name: "Engraving", value: "A", display: null }],
				prices: { ...simpleItem.prices, price: "125", regular_price: "250", sale_price: "125" },
				extensions: {
					kizlo: {
						product_id: 42,
						variation_id: 77,
						slug: "base-product",
						url: null,
						custom: { product_note: "Base product note" },
					},
				},
			},
		],
		items_count: 2.5,
		items_weight: 375,
		coupons: [
			{
				code: "SAVE10",
				discount_type: "percent",
				totals: { ...currency, total_discount: "50", total_discount_tax: "10" },
			},
		],
		fees: [{ key: "handling", name: "Handling", totals: { ...currency, total: "25", total_tax: "5" } }],
		cross_sells: [],
		needs_payment: true,
		needs_shipping: true,
		has_calculated_shipping: false,
		shipping_rates: [
			{
				package_id: "vendor:alpha",
				name: "Shipment",
				destination: { address_1: "", address_2: "", city: "", state: "CA", postcode: "", country: "US" },
				items: [{ key: "simple-key", name: "Repeated name", quantity: 1 }],
				shipping_rates: [
					{
						...currency,
						rate_id: "flat_rate:1",
						name: "Flat rate",
						description: "Standard delivery",
						delivery_time: "3 days",
						price: "500",
						taxes: "100",
						method_id: "flat_rate",
						instance_id: 1,
						meta_data: [{ key: "Items", value: "Repeated name" }],
						selected: true,
					},
				],
			},
		],
		billing_address: {
			first_name: "",
			last_name: "",
			company: "",
			address_1: "",
			address_2: "",
			city: "",
			state: "CA",
			postcode: "",
			country: "US",
			phone: "",
			email: "",
			billing_vat_id: "VAT-42",
		},
		shipping_address: {
			first_name: "",
			last_name: "",
			company: "",
			address_1: "",
			address_2: "",
			city: "",
			state: "CA",
			postcode: "",
			country: "US",
			phone: "",
			leave_at_door: true,
		},
		payment_methods: ["bacs", "cod"],
		payment_requirements: ["products"],
		errors: [
			{ code: "first", message: "Repeated name cannot be purchased" },
			{ code: "second", message: "Repeated name has changed" },
		],
		totals: {
			...currency,
			total_items: "450",
			total_items_tax: "90",
			total_fees: "25",
			total_fees_tax: "5",
			total_discount: "50",
			total_discount_tax: "10",
			total_shipping: null,
			total_shipping_tax: null,
			total_price: "510",
			total_tax: "85",
			tax_lines: [{ name: "Sales tax", price: "85", rate: "20%" }],
		},
		extensions: { kizlo: { internal: true }, acme: { opaque: "cart" } },
	}
}

test("deserializes complete cart data without legacy derivations", () => {
	const result = deserializeCart(rawCart())

	expect(Cart.safeParse(result).success).toBe(true)
	expect(result).toMatchObject({
		itemCount: 2.5,
		itemsWeight: 375,
		billingAddress: { address1: "", state: "CA", additionalFields: { billing_vat_id: "VAT-42" } },
		shippingAddress: { address1: "", additionalFields: { leave_at_door: true } },
		fees: [{ id: "handling", totals: { total: 25, tax: 5 } }],
		totals: { shippingTotal: null, shippingTaxTotal: null },
		extensions: { acme: { opaque: "cart" } },
	})
	expect(result.items[0]).toMatchObject({
		productId: 42,
		variationId: null,
		sku: null,
		slug: "base-product",
		url: "https://frontend.example/products/base-product",
		lowStockRemaining: 0,
		prices: { salePrice: null },
		custom: { product_note: "Typed note" },
		extensions: { acme: { opaque: true } },
	})
	expect(result.items[1]).toMatchObject({
		productId: 42,
		variationId: 77,
		quantity: 1.5,
		selectedAttributes: [{ name: "Size", attribute: "attribute_pa_size", value: "Large" }],
		itemData: [{ name: "Engraving", value: "A", display: null }],
		prices: { salePrice: 125 },
	})
	expect(result.items[0]).not.toHaveProperty("status")
	expect(result.errors).toHaveLength(2)
	expect(result.shippingPackages[0]?.id).toBe("vendor:alpha")
})

test("deserializes empty carts as non-null resources", () => {
	const cart = rawCart()
	cart.items = []
	cart.items_count = 0
	cart.items_weight = 0
	cart.coupons = []
	cart.fees = []
	cart.shipping_rates = []
	cart.errors = []

	const result = deserializeCart(cart)
	expect(Cart.safeParse(result).success).toBe(true)
	expect(result.items).toEqual([])
})

test("reuses ProductSummary serialization for cart cross-sells", () => {
	const cart = rawCart()
	cart.cross_sells = [
		{
			id: 91,
			name: "Cross-sell",
			slug: "cross-sell",
			parent: 0,
			type: "simple",
			variation: "",
			permalink: "https://store.example/cross-sell",
			sku: "CROSS",
			short_description: "Short",
			description: "Description",
			on_sale: false,
			prices: { ...currency, price: "900", regular_price: "900", sale_price: "", price_range: null },
			price_html: "$9.00",
			average_rating: "0",
			review_count: 0,
			images: [],
			categories: [],
			tags: [],
			brands: [],
			attributes: [],
			variations: [],
			grouped_products: [],
			has_options: false,
			is_purchasable: true,
			is_in_stock: true,
			is_on_backorder: false,
			stock_availability: { text: "In stock", class: "in-stock" },
			low_stock_remaining: null,
			sold_individually: false,
			add_to_cart: { text: "Add", description: "Add", url: "?add=91", single_text: "Add", minimum: 1, maximum: 99, multiple_of: 1 },
			is_password_protected: false,
			extensions: {
				kizlo: {
					url: "https://frontend.example/products/cross-sell",
					term_urls: [],
					stock: null,
					on_sale_from: null,
					on_sale_to: null,
					seo: null,
					custom: { product_note: "" },
				},
			},
			weight: "",
			dimensions: { length: "", width: "", height: "" },
			formatted_weight: "",
			formatted_dimensions: "",
		},
	]

	const [crossSell] = deserializeCart(cart).crossSells
	expect(crossSell).toMatchObject({ id: 91, slug: "cross-sell", url: "https://frontend.example/products/cross-sell" })
	expect(crossSell?.addToCart).not.toHaveProperty("url")
})

test("serializes only supplied customer fields and flattens merchant fields", () => {
	expect(
		serializeCartUpdateInput({
			billingAddress: { address1: "", additionalFields: { billing_vat_id: "VAT-7", marketing_opt_in: false } },
			shippingAddress: { postcode: "90210" },
		}),
	).toEqual({
		billing_address: { address_1: "", billing_vat_id: "VAT-7", marketing_opt_in: false },
		shipping_address: { postcode: "90210" },
	})
})
