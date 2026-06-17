import type { LiteralUnion } from "@kizlo/shared"
import type {
	WCS_CartBillingAddress,
	WCS_CartCoupon,
	WCS_CartError,
	WCS_CartItemImage,
	WCS_CartItemMetadata,
	WCS_CartItemPrices,
	WCS_CartItemQuantityLimits,
	WCS_CartItemTotals,
	WCS_CartItemVariation,
	WCS_CartShippingAddress,
	WCS_CartTaxLine,
	WCS_StoreCurrency,
} from "../cart/types.wcs"

// ==================================================
// SUPPORTING SCHEMAS
// ==================================================

export interface WCS_OrderItem {
	key: string
	id: number
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
}

export interface WCS_OrderTotals extends WCS_StoreCurrency {
	subtotal: string
	total_discount: string
	total_shipping: string | null
	total_fees: string
	total_tax: string
	total_refund: string
	total_price: string
	total_items: string
	total_items_tax: string
	total_fees_tax: string
	total_discount_tax: string
	total_shipping_tax: string | null
	tax_lines: WCS_CartTaxLine[]
}

// ==================================================
// ORDER (response schema)
// ==================================================

export interface WCS_Order {
	id: number
	status: LiteralUnion<"checkout-draft" | "pending" | "on-hold" | "processing" | "completed" | "cancelled" | "failed" | "refunded", string>
	items: WCS_OrderItem[]
	coupons: WCS_CartCoupon[]
	totals: WCS_OrderTotals
	shipping_address: WCS_CartShippingAddress
	billing_address: WCS_CartBillingAddress
	needs_payment: boolean
	needs_shipping: boolean
	errors: WCS_CartError[]
	payment_requirements: string[]
}

// ==================================================
// GET /order/<id>
// ==================================================

export interface WCS_OrderGetInput {
	/** The order ID. Path parameter. */
	id: number
	/** Authentication key for the order. */
	key: string
	/** Email address for guest orders. */
	billing_email?: string
}

// Order is a non-cart route (extends AbstractRoute, not AbstractCartRoute), so the
// universal cart-route nonce errors do NOT apply here — only AbstractRoute's
// woocommerce_rest_unknown_server_error catch-all. Permission errors below are
// returned as WP_Error from OrderAuthorizationTrait::is_authorized.
export type WCS_OrderGetErrorCode =
	| "woocommerce_rest_invalid_billing_email"
	| "woocommerce_rest_invalid_order"
	| "woocommerce_rest_invalid_user"
	| "woocommerce_rest_unknown_server_error"
