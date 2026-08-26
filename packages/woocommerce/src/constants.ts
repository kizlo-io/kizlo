/**
 * Base paths for the two WooCommerce APIs, used only where this package seeds or inspects a store
 * directly. Everything a procedure or service reaches goes through a generated endpoint, which derives
 * its own prefix from the namespace the plugin declares.
 */
export const WC_CORE_BASE = "/wp-json/wc/v3"
export const WC_STORE_BASE = "/wp-json/wc/store/v1"
