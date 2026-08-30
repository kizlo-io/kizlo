import { expect, test } from "vitest"
import { ListProductInput, Product, ProductFilters } from "./schema"
import type { WCSK_Product, WCSK_ProductCollectionData, WCSK_ProductDetail, WCSK_ProductSummary } from "./types"
import { deserializeProductFilters, deserializeProductRecommendations, deserializeStoreProduct, serializeProductListInput } from "./utils"

function rawProduct(): WCSK_Product {
	return {
		id: 42,
		name: "Custom product",
		slug: "custom-product",
		parent: 0,
		type: "subscription",
		variation: "Monthly plan",
		permalink: "https://store.example/products/custom-product",
		sku: "",
		short_description: "Short description",
		description: "Full description",
		on_sale: false,
		prices: {
			price: "100",
			regular_price: "200",
			sale_price: "125",
			price_range: { min_amount: "100", max_amount: "300" },
			currency_code: "USD",
			currency_symbol: "$",
			currency_minor_unit: 2,
			currency_decimal_separator: ".",
			currency_thousand_separator: ",",
			currency_prefix: "$",
			currency_suffix: "",
		},
		price_html: "$1.00",
		average_rating: "4.5",
		review_count: 3,
		images: [
			{
				id: 7,
				src: "https://store.example/full.jpg",
				thumbnail: "https://store.example/thumb.jpg",
				srcset: "full-1x.jpg 1x, full-2x.jpg 2x",
				sizes: "100vw",
				name: "Product image",
				alt: "Custom product",
				thumbnail_srcset: "thumb-1x.jpg 1x, thumb-2x.jpg 2x",
				thumbnail_sizes: "300px",
			},
		],
		categories: [{ id: 2, name: "Plans", slug: "plans", link: "https://store.example/product-category/plans" }],
		tags: [{ id: 3, name: "Popular", slug: "popular", link: "https://store.example/product-tag/popular" }],
		brands: [{ id: 4, name: "Acme", slug: "acme", link: "https://store.example/brand/acme" }],
		attributes: [
			{
				id: 0,
				name: "Term",
				taxonomy: null as unknown as string,
				has_variations: true,
				terms: [{ id: 0, name: "Monthly", slug: "monthly", default: true }],
			},
		],
		variations: [
			{
				id: 43,
				attributes: [{ name: "Term", value: null as unknown as string }],
			},
		],
		grouped_products: [44],
		has_options: true,
		is_purchasable: true,
		is_in_stock: true,
		is_on_backorder: false,
		stock_availability: { text: "In stock", class: "in-stock" },
		low_stock_remaining: 2,
		sold_individually: true,
		weight: "2.5",
		dimensions: { length: "10", width: "5", height: "3" },
		formatted_weight: "2.5 kg",
		formatted_dimensions: "10 × 5 × 3 cm",
		add_to_cart: {
			text: "Add to cart",
			description: "Add Custom product to your cart",
			url: "?add-to-cart=42",
			single_text: "Buy now",
			minimum: 1,
			maximum: 5,
			multiple_of: 1,
		},
		is_password_protected: false,
		extensions: {
			kizlo: {
				url: "https://frontend.example/products/custom-product",
				term_urls: [
					{ id: 2, taxonomy: "product_cat", url: "https://frontend.example/plans" },
					{ id: 3, taxonomy: "product_tag", url: "https://frontend.example/tags/popular" },
					{ id: 4, taxonomy: "product_brand", url: "https://frontend.example/brands/acme" },
				],
				stock: 4,
				on_sale_from: "2026-01-02T03:04:05Z",
				on_sale_to: "2026-02-03T04:05:06Z",
				seo: null,
				custom: { product_note: "Monthly plan" },
			},
			acme: { retained: true },
		} as WCSK_Product["extensions"],
	}
}

test("Store products normalize the complete public model without losing custom product types or extensions", () => {
	const result = deserializeStoreProduct(rawProduct(), null)

	expect(Product.safeParse(result).success).toBe(true)
	expect(result).toMatchObject({
		parentId: null,
		type: "subscription",
		sku: null,
		averageRating: 4.5,
		prices: { price: 100, regularPrice: 200, salePrice: null, priceRange: { minAmount: 100, maxAmount: 300 } },
		stockQuantity: 4,
		custom: { product_note: "Monthly plan" },
		extensions: { acme: { retained: true } },
		recommendations: null,
	})
	expect(result.attributes[0]?.taxonomy).toBeNull()
	expect(result.attributes[0]?.terms[0]?.isDefault).toBe(true)
	expect(result.variations[0]?.attributes[0]?.value).toBeNull()
	expect(result.images[0]).toEqual({
		type: "image",
		id: 7,
		name: "Product image",
		alt: "Custom product",
		src: "https://store.example/full.jpg",
		srcset: "full-1x.jpg 1x, full-2x.jpg 2x",
	})
	expect(result).not.toHaveProperty("storeUrl")
	expect(result.categories[0]?.url).toBe("https://frontend.example/plans")
	expect(result.tags[0]?.url).toBe("https://frontend.example/tags/popular")
	expect(result.brands[0]?.url).toBe("https://frontend.example/brands/acme")
	expect(result.saleStartsAt).toBe(Date.UTC(2026, 0, 2, 3, 4, 5))
})

test("Store products treat an omitted custom-attribute default flag as false", () => {
	const product = rawProduct()
	const term = product.attributes[0]?.terms[0]
	if (!term) throw new Error("Expected the product fixture to contain an attribute term")
	delete (term as Partial<typeof term>).default

	expect(deserializeStoreProduct(product, null).attributes[0]?.terms[0]?.isDefault).toBe(false)
})

test("Store product sale dates require an explicit timezone and do not depend on the host timezone", () => {
	const product = rawProduct()
	const kizlo = product.extensions.kizlo
	if (!kizlo) throw new Error("Expected the Kizlo product extension")

	const original = process.env.TZ
	const expected = Date.UTC(2026, 0, 2, 3, 4, 5)

	try {
		for (const timezone of ["UTC", "Asia/Kolkata"]) {
			process.env.TZ = timezone
			expect(deserializeStoreProduct(product, null).saleStartsAt).toBe(expected)
		}

		kizlo.on_sale_from = "2026-01-02T03:04:05"
		expect(deserializeStoreProduct(product, null).saleStartsAt).toBeNull()
		kizlo.on_sale_from = "invalid"
		expect(deserializeStoreProduct(product, null).saleStartsAt).toBeNull()
		kizlo.on_sale_from = null
		expect(deserializeStoreProduct(product, null).saleStartsAt).toBeNull()
	} finally {
		if (original === undefined) delete process.env.TZ
		else process.env.TZ = original
	}
})

test("missing Kizlo URLs stay null instead of falling back to WooCommerce links", () => {
	const product = rawProduct()
	product.extensions = { kizlo: null, acme: { retained: true } }

	const result = deserializeStoreProduct(product, null)

	expect(result.url).toBeNull()
	expect(result.categories[0]?.url).toBeNull()
	expect(result.tags[0]?.url).toBeNull()
	expect(result.brands[0]?.url).toBeNull()
})

test("embedded recommendations flatten their collection wrapper and default missing relations to empty lists", () => {
	const product = rawProduct()
	const summary = product as WCSK_ProductSummary
	const detail = {
		...product,
		_embedded: { upsells: [[summary]], cross_sells: [], related: [[summary], [summary]] },
	} as WCSK_ProductDetail

	const result = deserializeProductRecommendations(detail)

	expect(result.upsells.map((item) => item.id)).toEqual([42])
	expect(result.crossSells).toEqual([])
	expect(result.related.map((item) => item.id)).toEqual([42, 42])
	expect(deserializeProductRecommendations({ ...product, _embedded: undefined } as WCSK_ProductDetail)).toEqual({
		upsells: [],
		crossSells: [],
		related: [],
	})
})

test("product list input maps every fixed Store API collection property", () => {
	const input = ListProductInput.parse({
		page: "2",
		perPage: "24",
		search: "shirt",
		recommendations: "true",
		slug: ["blue-shirt", "green-shirt"],
		after: "2026-01-01T00:00:00Z",
		before: "2026-12-31T23:59:59Z",
		dateColumn: "modified_gmt",
		exclude: [1, "2"],
		include: 3,
		offset: "4",
		order: "asc",
		orderBy: "modified",
		parent: [5, "6"],
		parentExclude: 7,
		type: "subscription",
		sku: ["SKU-1", "SKU-2"],
		featured: "true",
		category: [8, "plans"],
		categoryOperator: "and",
		brand: [9, "acme"],
		brandOperator: "not_in",
		tag: [10, "popular"],
		tagOperator: "in",
		onSale: "false",
		minPrice: 0,
		maxPrice: "1500",
		stockStatus: ["instock", "onbackorder"],
		attributes: [{ taxonomy: "pa_color", slug: ["blue", "green"], termId: [11, "12"], operator: "in" }],
		attributeRelation: "and",
		catalogVisibility: "visible",
		rating: [4, "5"],
		related: "13",
		taxonomies: [
			{ taxonomy: "product_material", slugs: ["cotton", "linen"], operator: "and" },
			{ taxonomy: "product_season", termIds: [14, "15"] },
		],
	})

	const serialized = serializeProductListInput(input)

	expect(serialized).not.toHaveProperty("recommendations")
	expect(serialized).not.toHaveProperty("_embed")
	expect(serialized).toEqual({
		after: "2026-01-01T00:00:00Z",
		attribute_relation: "and",
		attributes: [{ attribute: "pa_color", slug: ["blue", "green"], term_id: [11, 12], operator: "in" }],
		before: "2026-12-31T23:59:59Z",
		brand: "9,acme",
		brand_operator: "not_in",
		catalog_visibility: "visible",
		category: "8,plans",
		category_operator: "and",
		date_column: "modified_gmt",
		exclude: [1, 2],
		featured: true,
		include: [3],
		max_price: "1500",
		min_price: "0",
		offset: 4,
		on_sale: false,
		order: "asc",
		orderby: "modified",
		page: 2,
		parent: [5, 6],
		parent_exclude: [7],
		per_page: 24,
		rating: [4, 5],
		related: 13,
		search: "shirt",
		sku: "SKU-1,SKU-2",
		slug: "blue-shirt,green-shirt",
		stock_status: ["instock", "onbackorder"],
		tag: "10,popular",
		tag_operator: "in",
		type: "subscription",
		_unstable_tax_product_material: "cotton,linen",
		_unstable_tax_product_material_operator: "and",
		_unstable_tax_product_season: "14,15",
	})
})

test("custom taxonomy filters require exactly one term representation", () => {
	expect(() => ListProductInput.parse({ taxonomies: [{ taxonomy: "product_material" }] })).toThrow()
	expect(() => ListProductInput.parse({ taxonomies: [{ taxonomy: "product_material", termIds: [1], slugs: ["cotton"] }] })).toThrow()
})

test("product filters retain requested rating counts", () => {
	const data = {
		attribute_counts: null,
		kizlo: { attribute_counts: [], taxonomy_counts: [] },
		price_range: {
			currency_code: "USD",
			currency_symbol: "$",
			currency_minor_unit: 2,
			currency_decimal_separator: ".",
			currency_thousand_separator: ",",
			currency_prefix: "$",
			currency_suffix: "",
			min_price: "100",
			max_price: "500",
		},
		rating_counts: [
			{ rating: 4, count: 7 },
			{ rating: 5, count: 3 },
		],
		stock_status_counts: [],
		taxonomy_counts: null,
	} satisfies WCSK_ProductCollectionData

	const result = deserializeProductFilters(data)

	expect(ProductFilters.safeParse(result).success).toBe(true)
	expect(result?.ratingCounts).toEqual([
		{ rating: 4, count: 7 },
		{ rating: 5, count: 3 },
	])
})
