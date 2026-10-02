import type { WP_EndpointData } from "kizlo"

/** The storefront settings, exactly as the project's generated WordPress client describes them. */
export type WCK_Storefront = WP_EndpointData<"woocommerce.kizlo.storefront.retrieve">
