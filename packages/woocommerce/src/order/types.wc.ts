// ==================================================
// SHARED
// ==================================================

export type WC_Context = "view" | "edit"

export type WC_SortOrder = "asc" | "desc"

export type WC_OrderStatus = "pending" | "processing" | "on-hold" | "completed" | "cancelled" | "refunded" | "failed" | "trash"

export type WC_OrderListStatus = WC_OrderStatus | "any"

export type WC_OrderListOrderBy = "date" | "modified" | "id" | "include" | "title" | "slug"

export type WC_OrderFeeTaxStatus = "taxable" | "none"

export type WC_CouponDiscountType = "percent" | "fixed_cart" | "fixed_product"

export type WC_Currency =
	| "AED"
	| "AFN"
	| "ALL"
	| "AMD"
	| "ANG"
	| "AOA"
	| "ARS"
	| "AUD"
	| "AWG"
	| "AZN"
	| "BAM"
	| "BBD"
	| "BDT"
	| "BGN"
	| "BHD"
	| "BIF"
	| "BMD"
	| "BND"
	| "BOB"
	| "BRL"
	| "BSD"
	| "BTC"
	| "BTN"
	| "BWP"
	| "BYR"
	| "BZD"
	| "CAD"
	| "CDF"
	| "CHF"
	| "CLP"
	| "CNY"
	| "COP"
	| "CRC"
	| "CUC"
	| "CUP"
	| "CVE"
	| "CZK"
	| "DJF"
	| "DKK"
	| "DOP"
	| "DZD"
	| "EGP"
	| "ERN"
	| "ETB"
	| "EUR"
	| "FJD"
	| "FKP"
	| "GBP"
	| "GEL"
	| "GGP"
	| "GHS"
	| "GIP"
	| "GMD"
	| "GNF"
	| "GTQ"
	| "GYD"
	| "HKD"
	| "HNL"
	| "HRK"
	| "HTG"
	| "HUF"
	| "IDR"
	| "ILS"
	| "IMP"
	| "INR"
	| "IQD"
	| "IRR"
	| "IRT"
	| "ISK"
	| "JEP"
	| "JMD"
	| "JOD"
	| "JPY"
	| "KES"
	| "KGS"
	| "KHR"
	| "KMF"
	| "KPW"
	| "KRW"
	| "KWD"
	| "KYD"
	| "KZT"
	| "LAK"
	| "LBP"
	| "LKR"
	| "LRD"
	| "LSL"
	| "LYD"
	| "MAD"
	| "MDL"
	| "MGA"
	| "MKD"
	| "MMK"
	| "MNT"
	| "MOP"
	| "MRO"
	| "MUR"
	| "MVR"
	| "MWK"
	| "MXN"
	| "MYR"
	| "MZN"
	| "NAD"
	| "NGN"
	| "NIO"
	| "NOK"
	| "NPR"
	| "NZD"
	| "OMR"
	| "PAB"
	| "PEN"
	| "PGK"
	| "PHP"
	| "PKR"
	| "PLN"
	| "PRB"
	| "PYG"
	| "QAR"
	| "RON"
	| "RSD"
	| "RUB"
	| "RWF"
	| "SAR"
	| "SBD"
	| "SCR"
	| "SDG"
	| "SEK"
	| "SGD"
	| "SHP"
	| "SLL"
	| "SOS"
	| "SRD"
	| "SSP"
	| "STD"
	| "SYP"
	| "SZL"
	| "THB"
	| "TJS"
	| "TMT"
	| "TND"
	| "TOP"
	| "TRY"
	| "TTD"
	| "TWD"
	| "TZS"
	| "UAH"
	| "UGX"
	| "USD"
	| "UYU"
	| "UZS"
	| "VEF"
	| "VND"
	| "VUV"
	| "WST"
	| "XAF"
	| "XCD"
	| "XOF"
	| "XPF"
	| "YER"
	| "ZAR"
	| "ZMW"

// ==================================================
// SUPPORTING SCHEMAS
// ==================================================

export interface WC_OrderBilling {
	/** First name. */
	first_name: string
	/** Last name. */
	last_name: string
	/** Company name. */
	company: string
	/** Address line 1. */
	address_1: string
	/** Address line 2. */
	address_2: string
	/** City name. */
	city: string
	/** ISO code or name of the state, province or district. */
	state: string
	/** Postal code. */
	postcode: string
	/** Country code in ISO 3166-1 alpha-2 format. */
	country: string
	/** Email address. */
	email: string
	/** Phone number. */
	phone: string
}

export interface WC_OrderShipping {
	/** First name. */
	first_name: string
	/** Last name. */
	last_name: string
	/** Company name. */
	company: string
	/** Address line 1. */
	address_1: string
	/** Address line 2. */
	address_2: string
	/** City name. */
	city: string
	/** ISO code or name of the state, province or district. */
	state: string
	/** Postal code. */
	postcode: string
	/** Country code in ISO 3166-1 alpha-2 format. */
	country: string
	/** Phone number. */
	phone: string
}

export interface WC_OrderMetaData {
	/** Meta ID. Read-only. */
	id: number
	/** Meta key. */
	key: string
	/** Meta value. */
	value: unknown
}

export interface WC_OrderMetaDataInput {
	id?: number
	key: string
	value: unknown
}

export interface WC_OrderLineMetaData {
	/** Meta ID. Read-only. */
	id: number
	/** Meta key. */
	key: string
	/** Meta value. */
	value: unknown
	/** Meta key for UI display. Read-only. */
	display_key: string
	/** Meta value for UI display. Read-only. */
	display_value: string
}

export interface WC_OrderLineItemTax {
	/** Tax rate ID. */
	id: number
	/** Tax total. */
	total: string
	/** Tax subtotal. */
	subtotal: string
}

export interface WC_OrderLineItemImage {
	/** Image ID. */
	id: string
	/** Image URL. */
	src: string
}

export interface WC_OrderLineItem {
	/** Item ID. Read-only. */
	id: number
	/** Product name. */
	name: string
	/** Product ID. */
	product_id: number
	/** Variation ID, if applicable. */
	variation_id: number
	/** Quantity ordered. */
	quantity: number
	/** Slug of the tax class of product. */
	tax_class: string
	/** Line subtotal (before discounts). */
	subtotal: string
	/** Line subtotal tax (before discounts). Read-only. */
	subtotal_tax: string
	/** Line total (after discounts). */
	total: string
	/** Line total tax (after discounts). Read-only. */
	total_tax: string
	/** Line taxes. Read-only. */
	taxes: WC_OrderLineItemTax[]
	/** Meta data. */
	meta_data: WC_OrderLineMetaData[]
	/** Product SKU. Read-only. */
	sku: string
	/** GTIN, UPC, EAN or ISBN — a unique identifier for each distinct product. Read-only. */
	global_unique_id: string
	/** Product price. Read-only. */
	price: number
	/** Product image. Read-only. */
	image: WC_OrderLineItemImage
	/** Parent product name when this line item is a variation. Read-only. */
	parent_name: string | null
}

export interface WC_OrderTaxLine {
	/** Item ID. Read-only. */
	id: number
	/** Tax rate code. Read-only. */
	rate_code: string
	/** Tax rate ID. Read-only. */
	rate_id: number
	/** Tax rate label. Read-only. */
	label: string
	/** Whether or not this is a compound tax rate. Read-only. */
	compound: boolean
	/** Tax total (not including shipping taxes). Read-only. */
	tax_total: string
	/** Shipping tax total. Read-only. */
	shipping_tax_total: string
	/** Tax rate percentage. Read-only. */
	rate_percent: number
	/** Meta data. */
	meta_data: WC_OrderLineMetaData[]
}

export interface WC_OrderShippingLine {
	/** Item ID. Read-only. */
	id: number
	/** Shipping method name. */
	method_title: string
	/** Shipping method ID. */
	method_id: string
	/** Shipping method instance ID. */
	instance_id: string
	/** Line total (after discounts). */
	total: string
	/** Line total tax (after discounts). Read-only. */
	total_tax: string
	/** Tax status of shipping. */
	tax_status: WC_OrderFeeTaxStatus
	/** Line taxes. Read-only. */
	taxes: WC_OrderLineItemTax[]
	/** Meta data. */
	meta_data: WC_OrderLineMetaData[]
}

export interface WC_OrderFeeLine {
	/** Item ID. Read-only. */
	id: number
	/** Fee name. */
	name: string
	/** Tax class of fee. */
	tax_class: string
	/** Tax status of fee. */
	tax_status: WC_OrderFeeTaxStatus
	/** Line total (after discounts). */
	total: string
	/** Line total tax (after discounts). Read-only. */
	total_tax: string
	/** Line taxes. Read-only. */
	taxes: WC_OrderLineItemTax[]
	/** Meta data. */
	meta_data: WC_OrderLineMetaData[]
}

export interface WC_OrderCouponLine {
	/** Item ID. Read-only. */
	id: number
	/** Coupon code. */
	code: string
	/** Discount total. Read-only. */
	discount: string
	/** Discount total tax. Read-only. */
	discount_tax: string
	/** Discount type. Read-only. */
	discount_type: WC_CouponDiscountType
	/** Nominal amount of the coupon. Read-only. */
	nominal_amount: number
	/** Whether the coupon grants free shipping. Read-only. */
	free_shipping: boolean
	/** Meta data. */
	meta_data: WC_OrderLineMetaData[]
}

export interface WC_OrderRefundRef {
	/** Refund ID. Read-only. */
	id: number
	/** Refund reason. Read-only. */
	reason: string
	/** Refund total. Read-only. */
	total: string
}

// ==================================================
// ORDER (response schema)
// ==================================================

export interface WC_Order {
	/** Unique identifier for the resource. Read-only. */
	id: number
	/** Parent order ID. */
	parent_id: number
	/** Order number. Read-only. */
	number: string
	/** Order key. Read-only. */
	order_key: string
	/** Shows where the order was created. It can only be set during order creation and cannot be modified afterward. */
	created_via: string
	/** Version of WooCommerce which last updated the order. Read-only. */
	version: string
	/** Order status. */
	status: WC_OrderStatus
	/** Currency the order was created with, in ISO format. */
	currency: WC_Currency
	/** The date the order was created, in the site's timezone. Read-only. */
	date_created: string
	/** The date the order was created, as GMT. Read-only. */
	date_created_gmt: string
	/** The date the order was last modified, in the site's timezone. Read-only. */
	date_modified: string
	/** The date the order was last modified, as GMT. Read-only. */
	date_modified_gmt: string
	/** Total discount amount for the order. Read-only. */
	discount_total: string
	/** Total discount tax amount for the order. Read-only. */
	discount_tax: string
	/** Total shipping amount for the order. Read-only. */
	shipping_total: string
	/** Total shipping tax amount for the order. Read-only. */
	shipping_tax: string
	/** Sum of line item taxes only. Read-only. */
	cart_tax: string
	/** Grand total. Read-only. */
	total: string
	/** Sum of all taxes. Read-only. */
	total_tax: string
	/** True the prices included tax during checkout. Read-only. */
	prices_include_tax: boolean
	/** User ID who owns the order. 0 for guests. */
	customer_id: number
	/** Customer's IP address. Read-only. */
	customer_ip_address: string
	/** User agent of the customer. Read-only. */
	customer_user_agent: string
	/** Note left by customer during checkout. */
	customer_note: string
	/** Billing address. */
	billing: WC_OrderBilling
	/** Shipping address. */
	shipping: WC_OrderShipping
	/** Payment method ID. */
	payment_method: string
	/** Payment method title. */
	payment_method_title: string
	/** Unique transaction ID. */
	transaction_id: string
	/** The date the order was paid, in the site's timezone. Null when unpaid. Read-only. */
	date_paid: string | null
	/** The date the order was paid, as GMT. Null when unpaid. Read-only. */
	date_paid_gmt: string | null
	/** The date the order was completed, in the site's timezone. Null when incomplete. Read-only. */
	date_completed: string | null
	/** The date the order was completed, as GMT. Null when incomplete. Read-only. */
	date_completed_gmt: string | null
	/** MD5 hash of cart items to ensure orders are not modified. Read-only. */
	cart_hash: string
	/** URL the customer can use to pay for the order. Read-only. */
	payment_url: string
	/** Whether the order can still be edited. Read-only. */
	is_editable: boolean
	/** Whether the order still requires payment. Read-only. */
	needs_payment: boolean
	/** Whether the order needs processing (contains non-virtual items). Read-only. */
	needs_processing: boolean
	/** Currency symbol for the order's currency. Read-only. */
	currency_symbol: string
	/** Meta data. */
	meta_data: WC_OrderMetaData[]
	/** Line items data. */
	line_items: WC_OrderLineItem[]
	/** Tax lines data. Read-only. */
	tax_lines: WC_OrderTaxLine[]
	/** Shipping lines data. */
	shipping_lines: WC_OrderShippingLine[]
	/** Fee lines data. */
	fee_lines: WC_OrderFeeLine[]
	/** Coupons line data. */
	coupon_lines: WC_OrderCouponLine[]
	/** List of refunds. Read-only. */
	refunds: WC_OrderRefundRef[]
}

// ==================================================
// LIST — GET /wc/v3/orders
// ==================================================

export interface WC_OrderListInput {
	/** Scope under which the request is made; determines fields present in response. */
	context?: WC_Context
	/** Current page of the collection. */
	page?: number
	/** Maximum number of items to be returned in result set. */
	per_page?: number
	/** Limit results to those matching a string. */
	search?: string
	/** Limit response to resources published after a given ISO8601 compliant date. */
	after?: string
	/** Limit response to resources published before a given ISO8601 compliant date. */
	before?: string
	/** Limit response to resources modified after a given ISO8601 compliant date. */
	modified_after?: string
	/** Limit response to resources modified after a given ISO8601 compliant date. */
	modified_before?: string
	/** Whether to interpret dates as GMT when limiting response by published or modified date. */
	dates_are_gmt?: boolean
	/** Ensure result set excludes specific IDs. */
	exclude?: number[]
	/** Limit result set to specific ids. */
	include?: number[]
	/** Offset the result set by a specific number of items. */
	offset?: number
	/** Order sort attribute ascending or descending. */
	order?: WC_SortOrder
	/** Sort collection by object attribute. */
	orderby?: WC_OrderListOrderBy
	/** Limit result set to those of particular parent IDs. */
	parent?: number[]
	/** Limit result set to all items except those of a particular parent ID. */
	parent_exclude?: number[]
	/** Limit result set to orders assigned a specific status. */
	status?: WC_OrderListStatus[]
	/** Limit result set to orders assigned a specific customer. */
	customer?: number
	/** Limit result set to orders assigned a specific product. */
	product?: number
	/** Number of decimal points to use in each resource. */
	dp?: number
	/** Limit result set to orders created via specific sources (e.g. checkout, store-api). Multiple options can be provided as a comma-separated list. */
	created_via?: string
}

export type WC_OrderListErrorCode = "woocommerce_rest_cannot_view"

// ==================================================
// CREATE — POST /wc/v3/orders
// ==================================================

export interface WC_OrderCreateInput {
	parent_id?: number
	created_via?: string
	status?: WC_OrderStatus
	currency?: WC_Currency
	customer_id?: number
	customer_note?: string
	billing?: WC_OrderBilling
	shipping?: WC_OrderShipping
	payment_method?: string
	payment_method_title?: string
	transaction_id?: string
	meta_data?: WC_OrderMetaDataInput[]
	line_items?: WC_OrderLineItem[]
	shipping_lines?: WC_OrderShippingLine[]
	fee_lines?: WC_OrderFeeLine[]
	coupon_lines?: WC_OrderCouponLine[]
	/** Define if the order is paid. It will set the status to processing and reduce stock items. */
	set_paid?: boolean
}

export type WC_OrderCreateErrorCode = "woocommerce_rest_shop_order_exists" | "woocommerce_rest_cannot_create"

// ==================================================
// RETRIEVE — GET /wc/v3/orders/<id>
// ==================================================

export interface WC_OrderRetrieveInput {
	id: number
	/** Number of decimal points to use in each resource. */
	dp?: number
}

export type WC_OrderRetrieveErrorCode = "woocommerce_rest_cannot_view" | "woocommerce_rest_shop_order_invalid_id"

// ==================================================
// UPDATE — PUT /wc/v3/orders/<id>
// ==================================================

export interface WC_OrderUpdateInput {
	id: number
	parent_id?: number
	status?: WC_OrderStatus
	currency?: WC_Currency
	customer_id?: number
	customer_note?: string
	billing?: WC_OrderBilling
	shipping?: WC_OrderShipping
	payment_method?: string
	payment_method_title?: string
	transaction_id?: string
	meta_data?: WC_OrderMetaDataInput[]
	line_items?: WC_OrderLineItem[]
	shipping_lines?: WC_OrderShippingLine[]
	fee_lines?: WC_OrderFeeLine[]
	coupon_lines?: WC_OrderCouponLine[]
}

export type WC_OrderUpdateErrorCode = "woocommerce_rest_cannot_edit" | "woocommerce_rest_shop_order_invalid_id"

// ==================================================
// DELETE — DELETE /wc/v3/orders/<id>
// ==================================================

export interface WC_OrderDeleteInput {
	id: number
	/** Use true whether to permanently delete the order. */
	force?: boolean
}

export type WC_OrderDeleteResponse = WC_Order

export type WC_OrderDeleteErrorCode =
	| "woocommerce_rest_cannot_delete"
	| "woocommerce_rest_user_cannot_delete_shop_order"
	| "woocommerce_rest_shop_order_invalid_id"
	| "woocommerce_rest_already_trashed"
	| "woocommerce_rest_trash_not_supported"

// ==================================================
// BATCH — POST /wc/v3/orders/batch
// ==================================================

export interface WC_OrderBatchInput {
	create?: WC_OrderCreateInput[]
	update?: Array<WC_OrderUpdateInput & { id: number }>
	delete?: number[]
}

export interface WC_OrderBatchResponse {
	create?: WC_Order[]
	update?: WC_Order[]
	delete?: WC_Order[]
}

export type WC_OrderBatchErrorCode =
	| "woocommerce_rest_cannot_batch"
	| WC_OrderCreateErrorCode
	| WC_OrderUpdateErrorCode
	| WC_OrderDeleteErrorCode
