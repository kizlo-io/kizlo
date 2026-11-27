import type { BrowserClientRegistry, WP_Client } from "./wordpress/types"

/** Browser hooks require the project's generated browser module; they never fall back to any. */
export type ActiveKizloClient = BrowserClientRegistry extends { introspection: infer TEndpoints extends object }
	? WP_Client<TEndpoints>
	: { readonly ERROR_Import_introspection_browser_after_running_kizlo_generate: never }
