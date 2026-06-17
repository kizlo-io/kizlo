import type { Duration } from "@kizlo/shared"

export const WC_CORE_BASE = `/wp-json/wc/v3`
export const WP_CORE_BASE = "/wp-json/wp/v2"
export const WP_KIZLO_BASE = `/wp-json/kizlo/v1`
export const WC_STORE_BASE = `/wp-json/wc/store/v1`

export const CART_HASH_HEADER_KEY = "cart-hash"

export const WP_AUTH_TYPE = "Basic"
export const WP_AUTH_HEADER_KEY = "authorization"

export const UNEXPECTED_BODY_SNIPPET_LENGTH = 500

export const SAFE_REQUEST_TIMEOUT: Duration = "30 seconds"
