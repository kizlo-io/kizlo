// ==================================================
// SHARED
// ==================================================

export type WCS_Context = "view" | "edit"

export type WCS_ProductType = "simple" | "grouped" | "external" | "variable" | "variation"

export type WCS_ProductStockStatus = "instock" | "outofstock" | "onbackorder"

export type WCS_CatalogVisibility = "any" | "visible" | "catalog" | "search" | "hidden"

export type WCS_ProductRating = 1 | 2 | 3 | 4 | 5

export type WCS_DateColumn = "date" | "date_gmt" | "modified" | "modified_gmt"

export type WCS_Order = "asc" | "desc"

export type WCS_ProductsOrderBy =
	| "date"
	| "modified"
	| "id"
	| "include"
	| "title"
	| "slug"
	| "price"
	| "popularity"
	| "rating"
	| "menu_order"
	| "comment_count"

export type WCS_TaxonomyOperator = "in" | "not_in" | "and"

export type WCS_AttributeRelation = "in" | "and"

// ==================================================
// SUPPORTING SCHEMAS
// ==================================================

export interface WCS_ProductImage {
	id: number
	src: string
	thumbnail: string
	srcset: string
	sizes: string
	thumbnail_srcset: string
	thumbnail_sizes: string
	name: string
	alt: string
}

export interface WCS_CurrencyInfo {
	currency_code: string
	currency_symbol: string
	currency_minor_unit: number
	currency_decimal_separator: string
	currency_thousand_separator: string
	currency_prefix: string
	currency_suffix: string
}

export interface WCS_ProductPriceRange {
	min_amount: string
	max_amount: string
}

export interface WCS_ProductPrices extends WCS_CurrencyInfo {
	price: string
	regular_price: string
	sale_price: string
	price_range: WCS_ProductPriceRange | null
}

export interface WCS_ProductCategory {
	id: number
	name: string
	slug: string
	link: string
}

export interface WCS_ProductTag {
	id: number
	name: string
	slug: string
	link: string
}

export interface WCS_ProductBrand {
	id: number
	name: string
	slug: string
	link: string
}

export interface WCS_ProductAttributeTerm {
	id: number
	name: string
	slug: string
	default: boolean
}

export interface WCS_ProductAttribute {
	id: number
	name: string
	taxonomy: string
	has_variations: boolean
	terms: WCS_ProductAttributeTerm[]
}

export interface WCS_ProductVariationAttribute {
	name: string
	value: string
}

export interface WCS_ProductVariation {
	id: number
	attributes: WCS_ProductVariationAttribute[]
}

export interface WCS_ProductStockAvailability {
	text: string
	class: string
}

export interface WCS_ProductDimensions {
	length: string
	width: string
	height: string
}

export interface WCS_ProductAddToCart {
	text: string
	description: string
	url: string
	minimum: number
	maximum: number
	multiple_of: number
	single_text: string
}

export interface WCS_ProductCollectionDataPriceRange extends WCS_CurrencyInfo {
	min_price: string
	max_price: string
}

export interface WCS_ProductCollectionDataAttributeCount {
	term: number
	count: number
}

export interface WCS_ProductCollectionDataRatingCount {
	rating: number
	count: number
}

export interface WCS_ProductCollectionDataStockStatusCount {
	status: WCS_ProductStockStatus
	count: number
}

export interface WCS_ProductCollectionDataTaxonomyCount {
	term: number
	count: number
}

// ==================================================
// PRODUCT (response schema)
// ==================================================

export interface WCS_Product {
	id: number
	name: string
	slug: string
	parent: number
	type: WCS_ProductType
	variation: string
	permalink: string
	sku: string
	short_description: string
	description: string
	on_sale: boolean
	prices: WCS_ProductPrices
	price_html: string
	average_rating: string
	review_count: number
	images: WCS_ProductImage[]
	categories: WCS_ProductCategory[]
	tags: WCS_ProductTag[]
	brands: WCS_ProductBrand[]
	attributes: WCS_ProductAttribute[]
	variations: WCS_ProductVariation[]
	grouped_products: number[]
	has_options: boolean
	is_purchasable: boolean
	is_in_stock: boolean
	is_on_backorder: boolean
	stock_availability: WCS_ProductStockAvailability
	low_stock_remaining: number | null
	sold_individually: boolean
	weight: string
	dimensions: WCS_ProductDimensions
	formatted_weight: string
	formatted_dimensions: string
	add_to_cart: WCS_ProductAddToCart
	is_password_protected: boolean
	extensions: Record<string, unknown>
}

// ==================================================
// GET /products
// ==================================================

export interface WCS_ProductsAttributeFilter {
	/** Attribute taxonomy name. */
	attribute?: string
	/** List of attribute term IDs. */
	term_id?: number[]
	/** List of attribute slug(s). If a term ID is provided, this will be ignored. */
	slug?: string[]
	/** Operator to compare product attribute terms. */
	operator?: WCS_TaxonomyOperator
}

export interface WCS_ProductsListInput {
	/** Scope under which the request is made; determines fields present in response. */
	context?: WCS_Context
	/** Current page of the collection. */
	page?: number
	/** Maximum number of items to be returned in result set. */
	per_page?: number
	/** Limit results to those matching a string. */
	search?: string
	/** Limit result set to products with specific slug(s). Use commas to separate. */
	slug?: string
	/** Limit response to resources created after a given ISO8601 compliant date. */
	after?: string
	/** Limit response to resources created before a given ISO8601 compliant date. */
	before?: string
	/** When limiting response using after/before, which date column to compare against. Allowed values: `date`, `date_gmt`, `modified`, `modified_gmt` */
	date_column?: WCS_DateColumn
	/** Ensure result set excludes specific IDs. */
	exclude?: number[]
	/** Limit result set to specific ids. */
	include?: number[]
	/** Offset the result set by a specific number of items. */
	offset?: number
	/** Order sort attribute ascending or descending. Allowed values: `asc`, `desc` */
	order?: WCS_Order
	/** Sort collection by object attribute. Allowed values : `date`, `modified`, `id`, `include`, `title`, `slug`, `price`, `popularity`, `rating`, `menu_order`, `comment_count` */
	orderby?: WCS_ProductsOrderBy
	/** Limit result set to those of particular parent IDs. */
	parent?: number[]
	/** Limit result set to all items except those of a particular parent ID. */
	parent_exclude?: number[]
	/** Limit result set to products assigned a specific type. */
	type?: WCS_ProductType
	/** Limit result set to products with specific SKU(s). Use commas to separate. */
	sku?: string
	/** Limit result set to featured products. */
	featured?: boolean
	/** Limit result set to products assigned to categories IDs or slugs, separated by commas. */
	category?: string
	/** Operator to compare product category terms. Allowed values: `in`, `not_in`, `and` */
	category_operator?: WCS_TaxonomyOperator
	/** Limit result set to products assigned to brands IDs or slugs, separated by commas. */
	brand?: string
	/** Operator to compare product brand terms. Allowed values: `in`, `not_in`, `and` */
	brand_operator?: WCS_TaxonomyOperator
	/** Limit result set to products assigned a specific tag ID. */
	tag?: string
	/** Operator to compare product tags. Allowed values: `in`, `not_in`, `and` */
	tag_operator?: WCS_TaxonomyOperator
	/** Limit result set to products on sale. */
	on_sale?: boolean
	/** Limit result set to products based on a minimum price, provided using the smallest unit of the currency. */
	min_price?: string
	/** Limit result set to products based on a maximum price, provided using the smallest unit of the currency. */
	max_price?: string
	/** Limit result set to products with specified stock statuses. Expects an array of strings containing 'instock', 'outofstock' or 'onbackorder'. */
	stock_status?: WCS_ProductStockStatus[]
	/** Limit result set to specific attribute terms. Expects an array of objects containing `attribute` (taxonomy), `term_id` or `slug`, and optional `operator` for comparison. */
	attributes?: WCS_ProductsAttributeFilter[]
	/** The logical relationship between attributes when filtering across multiple at once. */
	attribute_relation?: WCS_AttributeRelation
	/** Determines if hidden or visible catalog products are shown. Allowed values: `any`, `visible`, `catalog`, `search`, `hidden` */
	catalog_visibility?: WCS_CatalogVisibility
	/** Limit result set to products with a certain average rating. Allowed values: `1`, `2`, `3`, `4`, `5`. */
	rating?: WCS_ProductRating[]
	/** Limit result set to products related to a specific product ID. */
	related?: number
	/** Dynamic custom-taxonomy filters: `_unstable_tax_<taxonomy>` for term IDs/slugs, `_unstable_tax_<taxonomy>_operator` for the comparison operator. */
	[key: `_unstable_tax_${string}`]: string | undefined
}

export type WCS_ProductsListErrorCode = "woocommerce_rest_unknown_server_error"

// ==================================================
// GET /products/:id
// ==================================================

export interface WCS_ProductGetInput {
	/** The ID of the product to retrieve. */
	id: number
}

export type WCS_ProductGetErrorCode = "woocommerce_rest_product_invalid_id" | "woocommerce_rest_unknown_server_error"

// ==================================================
// GET /products/:slug
// ==================================================

export interface WCS_ProductGetBySlugInput {
	/** The slug of the product to retrieve. */
	slug: string
}

export type WCS_ProductGetBySlugErrorCode = "woocommerce_rest_product_invalid_slug" | "woocommerce_rest_unknown_server_error"

// ==================================================
// PRODUCT COLLECTION DATA (response schema)
// ==================================================

export interface WCS_ProductCollectionData {
	price_range: WCS_ProductCollectionDataPriceRange | null
	attribute_counts: WCS_ProductCollectionDataAttributeCount[] | null
	rating_counts: WCS_ProductCollectionDataRatingCount[] | null
	stock_status_counts: WCS_ProductCollectionDataStockStatusCount[] | null
	taxonomy_counts: WCS_ProductCollectionDataTaxonomyCount[] | null
}

// ==================================================
// GET /products/collection-data
// ==================================================

export interface WCS_ProductCollectionDataAttributeCountQuery {
	/** Taxonomy name. */
	taxonomy?: string
	/** Filter condition being performed which may affect counts. Valid values include "and" and "or". */
	query_type?: "and" | "or"
}

export interface WCS_ProductCollectionDataInput extends WCS_ProductsListInput {
	/** Returns the min and max price for the product collection. If false, only `null` will be returned. */
	calculate_price_range?: boolean
	/** Returns attribute counts for a list of attribute taxonomies you pass in via this parameter. */
	calculate_attribute_counts?: WCS_ProductCollectionDataAttributeCountQuery[]
	/** Returns the counts of products with a certain average rating, 1-5. If false, only `null` will be returned. */
	calculate_rating_counts?: boolean
	/** Returns counts of products with each stock status (in stock, out of stock, on backorder). */
	calculate_stock_status_counts?: boolean
	/** Returns taxonomy counts for a list of taxonomies you pass in via this parameter. */
	calculate_taxonomy_counts?: string[]
}

export type WCS_ProductCollectionDataErrorCode = "woocommerce_rest_unknown_server_error"
