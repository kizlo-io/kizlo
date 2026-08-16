import type { WP_EndpointData } from "kizlo"

/** A customer, exactly as the project's generated WordPress client describes it. */
export type WCK_Customer = WP_EndpointData<"woocommerce.customers.retrieve">
