// ==================================================
// SHARED
// ==================================================

export type WC_Context = "view" | "edit"

export type WC_ProductType = "simple" | "grouped" | "external" | "variable"

export type WC_ProductStatus = "draft" | "pending" | "private" | "publish"

export type WC_ProductListStatus = "any" | "draft" | "pending" | "private" | "publish"

export type WC_CatalogVisibility = "visible" | "catalog" | "search" | "hidden"

export type WC_TaxStatus = "taxable" | "shipping" | "none"

export type WC_StockStatus = "instock" | "outofstock" | "onbackorder"

export type WC_BackorderStatus = "no" | "notify" | "yes"

export type WC_SortOrder = "asc" | "desc"

export type WC_ProductOrderBy = "date" | "modified" | "id" | "include" | "title" | "slug" | "price" | "popularity" | "rating" | "menu_order"

export type WC_ProductSearchField = "name" | "sku" | "global_unique_id" | "description" | "short_description"

// ==================================================
// SUPPORTING SCHEMAS
// ==================================================

export interface WC_ProductDownload {
	/** File ID. */
	id: string
	/** File name. */
	name: string
	/** File URL. */
	file: string
}

export interface WC_ProductDimensions {
	/** Product length. */
	length: string
	/** Product width. */
	width: string
	/** Product height. */
	height: string
}

export interface WC_ProductImage {
	/** The attachment ID from the Media Library. */
	id: number
	/** The date the image was created, in the site's timezone. Read-only. */
	date_created: string
	/** The date the image was created, as GMT. Read-only. */
	date_created_gmt: string
	/** The date the image was last modified, in the site's timezone. Read-only. */
	date_modified: string
	/** The date the image was last modified, as GMT. Read-only. */
	date_modified_gmt: string
	/** Image URL. */
	src: string
	/** Image name. */
	name: string
	/** Image alternative text. */
	alt: string
}

export interface WC_ProductCategoryRef {
	/** Category ID. */
	id: number
	/** Category name. Read-only. */
	name: string
	/** Category slug. Read-only. */
	slug: string
}

export interface WC_ProductTagRef {
	/** Tag ID. */
	id: number
	/** Tag name. Read-only. */
	name: string
	/** Tag slug. Read-only. */
	slug: string
}

export interface WC_ProductBrandRef {
	/** Brand ID. Required for write operations. */
	id: number
	/** Brand name. Read-only. */
	name: string
	/** Brand slug. Read-only. */
	slug: string
}

export interface WC_ProductAttribute {
	/** Attribute ID. */
	id: number
	/** Attribute name. */
	name: string
	/** Attribute position. */
	position: number
	/** Define if the attribute is visible on the "Additional information" tab in the product's page. */
	visible: boolean
	/** Define if the attribute can be used as variation. */
	variation: boolean
	/** List of available term names of the attribute. */
	options: string[]
}

export interface WC_ProductDefaultAttribute {
	/** Attribute ID. */
	id: number
	/** Attribute name. */
	name: string
	/** Selected attribute term name. */
	option: string
}

export interface WC_MetaData {
	/** Meta ID. Read-only. */
	id: number
	/** Meta key. */
	key: string
	/** Meta value. */
	value: string
}

export interface WC_MetaDataInput {
	id?: number
	key: string
	value: unknown
}

// ==================================================
// PRODUCT (response schema)
// ==================================================

export interface WC_Product {
	/** Unique identifier for the resource. Read-only. */
	id: number
	/** Product name. */
	name: string
	/** Product slug. */
	slug: string
	/** Product URL. Read-only. */
	permalink: string
	/** The date the product was created, in the site's timezone. Read-only. */
	date_created: string
	/** The date the product was created, as GMT. Read-only. */
	date_created_gmt: string
	/** The date the product was last modified, in the site's timezone. Read-only. */
	date_modified: string
	/** The date the product was last modified, as GMT. Read-only. */
	date_modified_gmt: string
	/** Product type. */
	type: WC_ProductType
	/** Product status (post status). */
	status: WC_ProductStatus
	/** Featured product. */
	featured: boolean
	/** Catalog visibility. */
	catalog_visibility: WC_CatalogVisibility
	/** Product description. */
	description: string
	/** Product short description. */
	short_description: string
	/** Unique identifier. */
	sku: string
	/** GTIN, UPC, EAN or ISBN — a unique identifier for each distinct product. */
	global_unique_id: string
	/** Current product price. Read-only. */
	price: string
	/** Product regular price. */
	regular_price: string
	/** Product sale price. */
	sale_price: string
	/** Start date of sale price, in the site's timezone. */
	date_on_sale_from: string
	/** Start date of sale price, as GMT. */
	date_on_sale_from_gmt: string
	/** End date of sale price, in the site's timezone. */
	date_on_sale_to: string
	/** End date of sale price, as GMT. */
	date_on_sale_to_gmt: string
	/** Price formatted in HTML. Read-only. */
	price_html: string
	/** Shows if the product is on sale. Read-only. */
	on_sale: boolean
	/** Shows if the product can be bought. Read-only. */
	purchasable: boolean
	/** Amount of sales. Read-only. */
	total_sales: number
	/** If the product is virtual. */
	virtual: boolean
	/** If the product is downloadable. */
	downloadable: boolean
	/** List of downloadable files. */
	downloads: WC_ProductDownload[]
	/** Number of times downloadable files can be downloaded after purchase. */
	download_limit: number
	/** Number of days until access to downloadable files expires. */
	download_expiry: number
	/** Product external URL. Only for external products. */
	external_url: string
	/** Product external button text. Only for external products. */
	button_text: string
	/** Tax status. */
	tax_status: WC_TaxStatus
	/** Tax class. */
	tax_class: string
	/** Stock management at product level. */
	manage_stock: boolean
	/** Stock quantity. */
	stock_quantity: number
	/** Controls the stock status. */
	stock_status: WC_StockStatus
	/** If managing stock, controls if backorders allowed. */
	backorders: WC_BackorderStatus
	/** Shows if backorders are allowed. Read-only. */
	backorders_allowed: boolean
	/** Shows if the product is on backordered. Read-only. */
	backordered: boolean
	/** Allow one item to be bought in a single order. */
	sold_individually: boolean
	/** Product weight. */
	weight: string
	/** Product dimensions. */
	dimensions: WC_ProductDimensions
	/** Shows if the product need to be shipped. Read-only. */
	shipping_required: boolean
	/** Shows whether the product shipping is taxable. Read-only. */
	shipping_taxable: boolean
	/** Shipping class slug. */
	shipping_class: string
	/** Shipping class ID. Read-only. */
	shipping_class_id: number
	/** Allow reviews. */
	reviews_allowed: boolean
	/** Reviews average rating. Read-only. */
	average_rating: string
	/** Amount of reviews that the product have. Read-only. */
	rating_count: number
	/** List of related products IDs. Read-only. */
	related_ids: number[]
	/** List of up-sell products IDs. */
	upsell_ids: number[]
	/** List of cross-sell products IDs. */
	cross_sell_ids: number[]
	/** Product parent ID. */
	parent_id: number
	/** Optional note to send the customer after purchase. */
	purchase_note: string
	/** List of categories. */
	categories: WC_ProductCategoryRef[]
	/** List of tags. */
	tags: WC_ProductTagRef[]
	/** List of product brands. In write-mode pass array of brand objects with id property. */
	brands: WC_ProductBrandRef[]
	/** List of images. */
	images: WC_ProductImage[]
	/** List of attributes. */
	attributes: WC_ProductAttribute[]
	/** Defaults variation attributes. */
	default_attributes: WC_ProductDefaultAttribute[]
	/** List of variations IDs. Read-only. */
	variations: number[]
	/** List of grouped products ID. */
	grouped_products: number[]
	/** Menu order, used to custom sort products. */
	menu_order: number
	/** Meta data. */
	meta_data: WC_MetaData[]
}

// The list and retrieve operations are described by the plugin and generated into the WordPress
// client, so their inputs and error codes live in the contract rather than here. What is left is the
// product object and the write inputs, which the test fixture seeds through the admin API with.

// ==================================================
// CREATE — POST /wc/v3/products
// ==================================================

export interface WC_ProductCreateInput {
	name?: string
	slug?: string
	type?: WC_ProductType
	status?: WC_ProductStatus
	featured?: boolean
	catalog_visibility?: WC_CatalogVisibility
	description?: string
	short_description?: string
	post_password?: string
	sku?: string
	global_unique_id?: string
	regular_price?: string
	sale_price?: string
	date_on_sale_from?: string
	date_on_sale_from_gmt?: string
	date_on_sale_to?: string
	date_on_sale_to_gmt?: string
	virtual?: boolean
	downloadable?: boolean
	downloads?: WC_ProductDownload[]
	download_limit?: number
	download_expiry?: number
	external_url?: string
	button_text?: string
	tax_status?: WC_TaxStatus
	tax_class?: string
	manage_stock?: boolean
	stock_quantity?: number
	stock_status?: WC_StockStatus
	backorders?: WC_BackorderStatus
	sold_individually?: boolean
	weight?: string
	dimensions?: WC_ProductDimensions
	shipping_class?: string
	reviews_allowed?: boolean
	upsell_ids?: number[]
	cross_sell_ids?: number[]
	parent_id?: number
	purchase_note?: string
	categories?: WC_ProductCategoryRef[]
	tags?: WC_ProductTagRef[]
	brands?: WC_ProductBrandRef[]
	images?: WC_ProductImage[]
	attributes?: WC_ProductAttribute[]
	default_attributes?: WC_ProductDefaultAttribute[]
	grouped_products?: number[]
	menu_order?: number
	meta_data?: WC_MetaDataInput[]
}

export type WC_ProductCreateErrorCode =
	| "woocommerce_rest_product_exists"
	| "woocommerce_rest_cannot_create"
	| "woocommerce_rest_invalid_product_id"

// ==================================================
// UPDATE — PUT /wc/v3/products/<id>
// ==================================================

export interface WC_ProductUpdateInput {
	id: number
	name?: string
	slug?: string
	type?: WC_ProductType
	status?: WC_ProductStatus
	featured?: boolean
	catalog_visibility?: WC_CatalogVisibility
	description?: string
	short_description?: string
	post_password?: string
	sku?: string
	global_unique_id?: string
	regular_price?: string
	sale_price?: string
	date_on_sale_from?: string
	date_on_sale_from_gmt?: string
	date_on_sale_to?: string
	date_on_sale_to_gmt?: string
	virtual?: boolean
	downloadable?: boolean
	downloads?: WC_ProductDownload[]
	download_limit?: number
	download_expiry?: number
	external_url?: string
	button_text?: string
	tax_status?: WC_TaxStatus
	tax_class?: string
	manage_stock?: boolean
	stock_quantity?: number
	stock_status?: WC_StockStatus
	backorders?: WC_BackorderStatus
	sold_individually?: boolean
	weight?: string
	dimensions?: WC_ProductDimensions
	shipping_class?: string
	reviews_allowed?: boolean
	upsell_ids?: number[]
	cross_sell_ids?: number[]
	parent_id?: number
	purchase_note?: string
	categories?: WC_ProductCategoryRef[]
	tags?: WC_ProductTagRef[]
	brands?: WC_ProductBrandRef[]
	images?: WC_ProductImage[]
	attributes?: WC_ProductAttribute[]
	default_attributes?: WC_ProductDefaultAttribute[]
	grouped_products?: number[]
	menu_order?: number
	meta_data?: WC_MetaDataInput[]
}

export type WC_ProductUpdateErrorCode =
	| "woocommerce_rest_product_invalid_id"
	| "woocommerce_rest_cannot_edit"
	| "woocommerce_rest_invalid_product_id"

// ==================================================
// DELETE — DELETE /wc/v3/products/<id>
// ==================================================

export interface WC_ProductDeleteInput {
	id: number
	/** Use true whether to permanently delete the product. */
	force?: boolean
}

export type WC_ProductDeleteResponse = WC_Product

export type WC_ProductDeleteErrorCode =
	| "woocommerce_rest_cannot_delete"
	| "woocommerce_rest_user_cannot_delete_product"
	| "woocommerce_rest_invalid_product_id"
	| "woocommerce_rest_product_invalid_id"
	| "woocommerce_rest_already_trashed"
	| "woocommerce_rest_trash_not_supported"

// ==================================================
// BATCH — POST /wc/v3/products/batch
// ==================================================

export interface WC_ProductBatchInput {
	create?: WC_ProductCreateInput[]
	update?: Array<WC_ProductUpdateInput & { id: number }>
	delete?: number[]
}

export interface WC_ProductBatchResponse {
	create?: WC_Product[]
	update?: WC_Product[]
	delete?: WC_Product[]
}

export type WC_ProductBatchErrorCode =
	| "woocommerce_rest_cannot_batch"
	| WC_ProductCreateErrorCode
	| WC_ProductUpdateErrorCode
	| WC_ProductDeleteErrorCode
