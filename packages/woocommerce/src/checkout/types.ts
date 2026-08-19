import type { WP_EndpointData } from "kizlo"

/**
 * The checkout, exactly as the project's generated WordPress client describes it.
 *
 * `get`, `update` and `process` all resolve to this: three operations on one path served by one
 * schema class.
 */
export type WCK_Checkout = WP_EndpointData<"woocommerce.store.checkout.get">

/**
 * What paying an existing order answers with.
 *
 * A separate alias because `CheckoutOrderSchema` overrides `get_properties()`. It is the checkout
 * minus what only a draft has, so the two are close enough to confuse and far enough apart that one
 * type would be wrong for the other.
 */
export type WCK_CheckoutOrder = WP_EndpointData<"woocommerce.store.checkout.processOrder">
