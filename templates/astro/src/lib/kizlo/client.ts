import { createBrowserClient } from "kizlo/browser"
import { introspection } from "./generated/introspection.browser"

export const client = createBrowserClient({ url: import.meta.env.PUBLIC_KIZLO_WP_URL ?? "", endpoints: introspection })
