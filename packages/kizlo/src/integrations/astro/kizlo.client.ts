import { KizloClient } from "../../client"
import type { AnyProcedureRouter } from "../../shared/procedure"
import { getServerBaseUrl } from "./utils"

export interface KizloClientOptions {
	/**
	 * Backend URL. In the browser, pass `import.meta.env.PUBLIC_KIZLO_API_URL` at the call site so Vite
	 * inlines it into the client bundle (see the template's `client.ts`); when omitted it falls back to
	 * `PUBLIC_KIZLO_API_URL` from `process.env`.
	 */
	url?: string
}

export function createKizloClient<T extends AnyProcedureRouter>(contract: T, options?: KizloClientOptions): KizloClient<T> {
	const url = options?.url ?? getServerBaseUrl()
	return new KizloClient({ url, contract })
}
