import type { Duration } from "@kizlo/shared"

/**
 * Base paths for the two APIs still reached without a generated endpoint: WordPress core, which
 * fixtures and tests seed directly, and the Kizlo plugin's own, which the CLI calls before a client
 * exists. Everything else derives its prefix from the namespace its endpoint definition carries.
 */
export const WP_CORE_BASE = "/wp-json/wp/v2"
export const WP_KIZLO_BASE = "/wp-json/kizlo/v1"

export const WP_AUTH_TYPE = "Basic"
export const WP_AUTH_HEADER_KEY = "authorization"

export const UNEXPECTED_BODY_SNIPPET_LENGTH = 500

export const SAFE_REQUEST_TIMEOUT: Duration = "30 seconds"
