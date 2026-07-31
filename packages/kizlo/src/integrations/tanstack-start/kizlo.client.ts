import { KizloClient } from "../../client"
import type { AnyProcedureRouter } from "../../shared/procedure"
import { getServerBaseUrl } from "./utils"

export interface KizloClientOptions {
	/**
	 * Backend URL. Pass `import.meta.env.VITE_KIZLO_API_URL` at the call site (see the template's
	 * `client.ts`) so Vite inlines it into the browser bundle; when omitted it falls back to
	 * `VITE_KIZLO_API_URL` from `process.env`.
	 */
	url?: string
}

/**
 * The browser-safe Kizlo client for a TanStack Start app: it calls the app's own `/api/kizlo` endpoint
 * over HTTP, so it runs the same in the browser and during SSR. Server routes and server functions use
 * the server-to-server client from {@link createKizlo} instead.
 */
export function createKizloClient<T extends AnyProcedureRouter>(contract: T, options?: KizloClientOptions): KizloClient<T> {
	const url = options?.url ?? getServerBaseUrl()
	return new KizloClient({ url, contract })
}
