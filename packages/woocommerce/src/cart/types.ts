import type { WP_EndpointData } from "kizlo"

/**
 * The cart, exactly as the project's generated WordPress client describes it.
 *
 * All eight Store API cart operations resolve to this one shape: WooCommerce answers every mutation
 * with the whole cart rather than the piece it changed, and they all run through `CartSchema`. So
 * one alias covers the lot rather than each call site restating what it expects back.
 */
export type WCK_Cart = WP_EndpointData<"woocommerce.store.cart.get">

export type WCK_CartItem = WCK_Cart["items"][number]
export type WCK_CartCoupon = WCK_Cart["coupons"][number]
export type WCK_CartFee = WCK_Cart["fees"][number]
export type WCK_CartShippingPackage = WCK_Cart["shipping_rates"][number]
export type WCK_CartShippingRate = WCK_CartShippingPackage["shipping_rates"][number]
export type WCK_CartTotals = WCK_Cart["totals"]
