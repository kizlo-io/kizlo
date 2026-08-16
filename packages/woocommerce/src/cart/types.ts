import type { WP_EndpointData } from "kizlo"

/**
 * The cart, exactly as the project's generated WordPress client describes it.
 *
 * All eight Store API cart operations resolve to this one shape: WooCommerce answers every mutation
 * with the whole cart rather than the piece it changed, and they all run through `CartSchema`. So
 * one alias covers the lot rather than each call site restating what it expects back.
 */
export type WCK_Cart = WP_EndpointData<"woocommerce.store.cart.get">
