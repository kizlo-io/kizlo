import type { LiteralUnion } from "@kizlo/shared"

// ==================================================
// SHARED
// ==================================================

export interface WCS_StoreCurrency {
	currency_code: string
	currency_symbol: string
	currency_minor_unit: number
	currency_decimal_separator: string
	currency_thousand_separator: string
	currency_prefix: string
	currency_suffix: string
}

// ==================================================
// SUPPORTING SCHEMAS
// ==================================================

export interface WCS_CartItemQuantityLimits {
	minimum: number
	maximum: number
	multiple_of: number
	editable: boolean
}

export interface WCS_CartItemImage {
	id: number
	src: string
	thumbnail: string
	srcset: string
	sizes: string
	name: string
	alt: string
}

export interface WCS_CartItemVariation {
	raw_attribute: string
	attribute: string
	value: string
}

export interface WCS_CartItemMetadata {
	name: string
	value: string
	display: string
}

export interface WCS_CartItemPriceRange {
	min_amount: string
	max_amount: string
}

export interface WCS_CartItemRawPrices {
	precision: number
	price: string
	regular_price: string
	sale_price: string
}

export interface WCS_CartItemPrices extends WCS_StoreCurrency {
	price: string
	regular_price: string
	sale_price: string
	price_range: WCS_CartItemPriceRange | null
	raw_prices?: WCS_CartItemRawPrices
}

export interface WCS_CartItemTotals extends WCS_StoreCurrency {
	line_subtotal: string
	line_subtotal_tax: string
	line_total: string
	line_total_tax: string
}

export interface WCS_CartItem {
	key: string
	id: number
	type: LiteralUnion<"simple" | "variable" | "grouped" | "external" | "variation", string>
	quantity: number
	quantity_limits: WCS_CartItemQuantityLimits
	name: string
	short_description: string
	description: string
	sku: string
	low_stock_remaining: number | null
	backorders_allowed: boolean
	show_backorder_badge: boolean
	sold_individually: boolean
	permalink: string
	images: WCS_CartItemImage[]
	variation: WCS_CartItemVariation[]
	item_data: WCS_CartItemMetadata[]
	prices: WCS_CartItemPrices
	totals: WCS_CartItemTotals
	catalog_visibility: LiteralUnion<"visible" | "catalog" | "search" | "hidden", string>
	extensions: Record<string, unknown>
}

export interface WCS_CartCouponTotals extends WCS_StoreCurrency {
	total_discount: string
	total_discount_tax: string
}

export interface WCS_CartCoupon {
	code: string
	discount_type: LiteralUnion<"percent" | "fixed_cart" | "fixed_product", string>
	totals: WCS_CartCouponTotals
}

export interface WCS_CartFeeTotals extends WCS_StoreCurrency {
	total: string
	total_tax: string
}

export interface WCS_CartFee {
	id: string
	name: string
	totals: WCS_CartFeeTotals
}

export interface WCS_CartShippingRateDestination {
	address_1: string
	address_2: string
	city: string
	state: string
	postcode: string
	country: string
}

export interface WCS_CartShippingRatePackageItem {
	key: string
	name: string
	quantity: number
}

export interface WCS_CartShippingRateMetaData {
	key: string
	value: string
}

export interface WCS_CartShippingRate extends WCS_StoreCurrency {
	rate_id: string
	name: string
	description: string
	delivery_time: string
	price: string
	taxes: string
	instance_id: number
	method_id: LiteralUnion<"flat_rate" | "free_shipping" | "local_pickup", string>
	meta_data: WCS_CartShippingRateMetaData[]
	selected: boolean
}

export interface WCS_CartShippingRatePackage {
	package_id: number | string
	name: string
	destination: WCS_CartShippingRateDestination
	items: WCS_CartShippingRatePackageItem[]
	shipping_rates: WCS_CartShippingRate[]
}

export interface WCS_CartShippingAddress {
	first_name: string
	last_name: string
	company: string
	address_1: string
	address_2: string
	city: string
	state: string
	postcode: string
	country: string
	phone: string
}

export interface WCS_CartBillingAddress extends WCS_CartShippingAddress {
	email: string
}

export interface WCS_CartTaxLine {
	name: string
	price: string
	rate: string
}

export interface WCS_CartTotals extends WCS_StoreCurrency {
	total_items: string
	total_items_tax: string
	total_fees: string
	total_fees_tax: string
	total_discount: string
	total_discount_tax: string
	total_shipping: string | null
	total_shipping_tax: string | null
	total_price: string
	total_tax: string
	tax_lines: WCS_CartTaxLine[]
}

export interface WCS_CartError {
	code: string
	message: string
}

// ==================================================
// CART (response schema)
// ==================================================

export interface WCS_Cart {
	items: WCS_CartItem[]
	coupons: WCS_CartCoupon[]
	fees: WCS_CartFee[]
	totals: WCS_CartTotals
	shipping_address: WCS_CartShippingAddress
	billing_address: WCS_CartBillingAddress
	needs_payment: boolean
	needs_shipping: boolean
	payment_requirements: string[]
	has_calculated_shipping: boolean
	shipping_rates: WCS_CartShippingRatePackage[]
	items_count: number
	items_weight: number
	// Cross-sells return the full Product schema; deferred to a future wc-types Product run.
	cross_sells: unknown[]
	errors: WCS_CartError[]
	payment_methods: string[]
	extensions: Record<string, unknown>
}

// ==================================================
// GET /cart
// ==================================================

export interface WCS_CartGetInput {}

export type WCS_CartGetErrorCode =
	| "woocommerce_rest_cart_error"
	| "woocommerce_rest_invalid_nonce"
	| "woocommerce_rest_missing_nonce"
	| "woocommerce_rest_unknown_server_error"

// ==================================================
// POST /cart/add-item
// ==================================================

export interface WCS_CartAddItemVariationEntry {
	/** Variation attribute name. */
	attribute: string
	/** Variation attribute value. */
	value: string
}

export interface WCS_CartAddItemInput {
	/** The cart item product or variation ID. */
	id: number
	/** Quantity of this item in the cart. */
	quantity: number
	/** Chosen attributes (for variations) containing an array of objects with keys `attribute` and `value`. */
	variation: WCS_CartAddItemVariationEntry[]
}

// Note: CartController::add_to_cart and ::set_cart_item_quantity each contain one
// re-throw of a caught WC exception's dynamic code, so real responses may include
// codes not enumerated here. Treat error.code as a wider string at the handler boundary.
export type WCS_CartAddItemErrorCode =
	| "woocommerce_rest_cart_invalid_parent_product"
	| "woocommerce_rest_cart_invalid_product"
	| "woocommerce_rest_cart_item_exists"
	| "woocommerce_rest_invalid_variation_data"
	| "woocommerce_rest_missing_attributes"
	| "woocommerce_rest_missing_variation_data"
	| "woocommerce_rest_product_invalid_quantity"
	| "woocommerce_rest_product_not_purchasable"
	| "woocommerce_rest_product_out_of_stock"
	| "woocommerce_rest_product_partially_out_of_stock"
	| "woocommerce_rest_variation_id_from_variation_data"
	| "woocommerce_rest_cart_error"
	| "woocommerce_rest_invalid_nonce"
	| "woocommerce_rest_missing_nonce"
	| "woocommerce_rest_unknown_server_error"

// ==================================================
// POST /cart/update-item
// ==================================================

export interface WCS_CartUpdateItemInput {
	/** The key of the cart item to edit. */
	key: string
	/** Quantity of this item in the cart. */
	quantity: number
}

// set_cart_item_quantity re-throws stock-validation codes from add_to_cart, so the realistic
// surface includes the same stock errors as WCS_CartAddItemErrorCode.
export type WCS_CartUpdateItemErrorCode =
	| "woocommerce_rest_cart_invalid_product"
	| "woocommerce_rest_cart_invalid_key"
	| "woocommerce_rest_product_invalid_quantity"
	| "woocommerce_rest_product_out_of_stock"
	| "woocommerce_rest_product_partially_out_of_stock"
	| "woocommerce_rest_cart_error"
	| "woocommerce_rest_invalid_nonce"
	| "woocommerce_rest_missing_nonce"
	| "woocommerce_rest_unknown_server_error"

// ==================================================
// POST /cart/remove-item
// ==================================================

export interface WCS_CartRemoveItemInput {
	/** The key of the cart item to edit. */
	key: string
}

export type WCS_CartRemoveItemErrorCode =
	| "woocommerce_rest_cart_invalid_key"
	| "woocommerce_rest_cart_error"
	| "woocommerce_rest_invalid_nonce"
	| "woocommerce_rest_missing_nonce"
	| "woocommerce_rest_unknown_server_error"

// ==================================================
// POST /cart/apply-coupon
// ==================================================

export interface WCS_CartApplyCouponInput {
	/** The coupon code you wish to apply to the cart. */
	code: string
}

export type WCS_CartApplyCouponErrorCode =
	| "woocommerce_rest_cart_coupon_error"
	| "woocommerce_rest_cart_coupon_disabled"
	| "woocommerce_rest_cart_error"
	| "woocommerce_rest_invalid_nonce"
	| "woocommerce_rest_missing_nonce"
	| "woocommerce_rest_unknown_server_error"

// ==================================================
// POST /cart/remove-coupon
// ==================================================

export interface WCS_CartRemoveCouponInput {
	/** The coupon code you wish to remove from the cart. */
	code: string
}

export type WCS_CartRemoveCouponErrorCode =
	| "woocommerce_rest_cart_coupon_error"
	| "woocommerce_rest_cart_coupon_disabled"
	| "woocommerce_rest_cart_coupon_invalid_code"
	| "woocommerce_rest_cart_error"
	| "woocommerce_rest_invalid_nonce"
	| "woocommerce_rest_missing_nonce"
	| "woocommerce_rest_unknown_server_error"

// ==================================================
// POST /cart/select-shipping-rate
// ==================================================

export interface WCS_CartSelectShippingRateInput {
	/** The ID of the shipping package within the cart. */
	package_id: number
	/** The chosen rate ID for the package. */
	rate_id: string
}

export type WCS_CartSelectShippingRateErrorCode =
	| "woocommerce_rest_cart_missing_rate_id"
	| "woocommerce_rest_cart_shipping_rate_not_found"
	| "woocommerce_rest_shipping_disabled"
	| "woocommerce_rest_cart_error"
	| "woocommerce_rest_invalid_nonce"
	| "woocommerce_rest_missing_nonce"
	| "woocommerce_rest_unknown_server_error"

// ==================================================
// POST /cart/update-customer
// ==================================================

export interface WCS_CartUpdateCustomerBillingInput {
	/** Customer first name. */
	first_name?: string
	/** Customer last name. */
	last_name?: string
	/** Company name. */
	company?: string
	/** First line of the address being shipped to. */
	address_1?: string
	/** Second line of the address being shipped to. */
	address_2?: string
	/** City of the address being shipped to. */
	city?: string
	/** ISO code, or name, for the state, province, or district of the address being shipped to. */
	state?: string
	/** Zip or Postcode of the address being shipped to. */
	postcode?: string
	/** ISO code for the country of the address being shipped to. */
	country?: string
	/** Email for the customer. */
	email?: string
	/** Phone number of the customer. */
	phone?: string
}

export interface WCS_CartUpdateCustomerShippingInput {
	/** Customer first name. */
	first_name?: string
	/** Customer last name. */
	last_name?: string
	/** Company name. */
	company?: string
	/** First line of the address being shipped to. */
	address_1?: string
	/** Second line of the address being shipped to. */
	address_2?: string
	/** City of the address being shipped to. */
	city?: string
	/** ISO code, or name, for the state, province, or district of the address being shipped to. */
	state?: string
	/** Zip or Postcode of the address being shipped to. */
	postcode?: string
	/** ISO code for the country of the address being shipped to. */
	country?: string
	/** Phone number of the customer. */
	phone?: string
}

export interface WCS_CartUpdateCustomerInput {
	/** Customer billing address. */
	billing_address?: WCS_CartUpdateCustomerBillingInput
	/** Customer shipping address. */
	shipping_address?: WCS_CartUpdateCustomerShippingInput
}

// Address-field validation errors (invalid_email, invalid_country, invalid_state,
// invalid_postcode, invalid_phone) surface inside the response's `data.details`
// payload, not as the top-level `error.code` — so they are intentionally NOT in this union.
export type WCS_CartUpdateCustomerErrorCode =
	| "rest_invalid_param"
	| "woocommerce_rest_cart_error"
	| "woocommerce_rest_invalid_nonce"
	| "woocommerce_rest_missing_nonce"
	| "woocommerce_rest_unknown_server_error"

// ==================================================
// GET /cart/items
// ==================================================

export interface WCS_CartItemsListInput {}

export type WCS_CartItemsListErrorCode =
	| "woocommerce_rest_cart_error"
	| "woocommerce_rest_invalid_nonce"
	| "woocommerce_rest_missing_nonce"
	| "woocommerce_rest_unknown_server_error"

// ==================================================
// POST /cart/items
// ==================================================

export interface WCS_CartItemsCreateInput {
	/** The cart item product or variation ID. */
	id: number
	/** Quantity of this item in the cart. */
	quantity: number
	/** Chosen attributes (for variations) containing an array of objects with keys `attribute` and `value`. */
	variation: WCS_CartAddItemVariationEntry[]
}

export type WCS_CartItemsCreateErrorCode = WCS_CartAddItemErrorCode

// ==================================================
// DELETE /cart/items
// ==================================================

export interface WCS_CartItemsDeleteAllInput {}

export type WCS_CartItemsDeleteAllErrorCode =
	| "woocommerce_rest_cart_error"
	| "woocommerce_rest_invalid_nonce"
	| "woocommerce_rest_missing_nonce"
	| "woocommerce_rest_unknown_server_error"

// ==================================================
// GET /cart/items/<key>
// ==================================================

export interface WCS_CartItemRetrieveInput {
	/** The key of the cart item to retrieve. */
	key: string
}

export type WCS_CartItemRetrieveErrorCode =
	| "woocommerce_rest_cart_invalid_key"
	| "woocommerce_rest_cart_error"
	| "woocommerce_rest_invalid_nonce"
	| "woocommerce_rest_missing_nonce"
	| "woocommerce_rest_unknown_server_error"

// ==================================================
// PUT /cart/items/<key>
// ==================================================

export interface WCS_CartItemUpdateInput {
	/** The key of the cart item to edit. */
	key: string
	/** Quantity of this item in the cart. */
	quantity: number
}

export type WCS_CartItemUpdateErrorCode = WCS_CartUpdateItemErrorCode

// ==================================================
// DELETE /cart/items/<key>
// ==================================================

export interface WCS_CartItemDeleteInput {
	/** The key of the cart item to edit. */
	key: string
}

export type WCS_CartItemDeleteErrorCode =
	| "woocommerce_rest_cart_invalid_key"
	| "woocommerce_rest_cart_error"
	| "woocommerce_rest_invalid_nonce"
	| "woocommerce_rest_missing_nonce"
	| "woocommerce_rest_unknown_server_error"

// ==================================================
// GET /cart/coupons
// ==================================================

export interface WCS_CartCouponsListInput {}

export type WCS_CartCouponsListErrorCode =
	| "woocommerce_rest_cart_error"
	| "woocommerce_rest_invalid_nonce"
	| "woocommerce_rest_missing_nonce"
	| "woocommerce_rest_unknown_server_error"

// ==================================================
// POST /cart/coupons
// ==================================================

export interface WCS_CartCouponsCreateInput {
	/** The coupon code you wish to apply to the cart. */
	code: string
}

export type WCS_CartCouponsCreateErrorCode =
	| "woocommerce_rest_cart_coupon_error"
	| "woocommerce_rest_cart_coupon_disabled"
	| "woocommerce_rest_cart_error"
	| "woocommerce_rest_invalid_nonce"
	| "woocommerce_rest_missing_nonce"
	| "woocommerce_rest_unknown_server_error"

// ==================================================
// DELETE /cart/coupons
// ==================================================

export interface WCS_CartCouponsDeleteAllInput {}

export type WCS_CartCouponsDeleteAllErrorCode =
	| "woocommerce_rest_cart_error"
	| "woocommerce_rest_invalid_nonce"
	| "woocommerce_rest_missing_nonce"
	| "woocommerce_rest_unknown_server_error"

// ==================================================
// GET /cart/coupons/<code>
// ==================================================

export interface WCS_CartCouponRetrieveInput {
	/** The coupon code of the cart coupon to retrieve. */
	code: string
}

export type WCS_CartCouponRetrieveErrorCode =
	| "woocommerce_rest_cart_coupon_invalid_code"
	| "woocommerce_rest_cart_error"
	| "woocommerce_rest_invalid_nonce"
	| "woocommerce_rest_missing_nonce"
	| "woocommerce_rest_unknown_server_error"

// ==================================================
// DELETE /cart/coupons/<code>
// ==================================================

export interface WCS_CartCouponDeleteInput {
	/** The coupon code you wish to remove from the cart. */
	code: string
}

export type WCS_CartCouponDeleteErrorCode =
	| "woocommerce_rest_cart_coupon_invalid_code"
	| "woocommerce_rest_cart_error"
	| "woocommerce_rest_invalid_nonce"
	| "woocommerce_rest_missing_nonce"
	| "woocommerce_rest_unknown_server_error"

// ==================================================
// POST /cart/extensions
// ==================================================

export interface WCS_CartExtensionsInput {
	/** Extension's name - this will be used to ensure the data in the request is routed appropriately. */
	namespace: string
	/** Additional data to pass to the extension. */
	data: Record<string, unknown>
}

// CartExtensions re-throws the caught WC_REST_Exception's `getErrorCode()` dynamically,
// so the real code depends on which extension namespace handled the request. Typed as
// `string` rather than `never` to reflect that the union is open.
export type WCS_CartExtensionsErrorCode = string
