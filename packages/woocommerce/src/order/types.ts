import type { WP_EndpointData } from "kizlo"

/** The Store API order exactly as the generated WordPress client describes it. */
export type WCSK_Order = WP_EndpointData<"woocommerce.store.orders.get">

export type WCSK_OrderItem = WCSK_Order["items"][number]
export type WCSK_OrderCoupon = WCSK_Order["coupons"][number]
export type WCSK_OrderFee = WCSK_Order["fees"][number]
export type WCSK_OrderTotals = WCSK_Order["totals"]
