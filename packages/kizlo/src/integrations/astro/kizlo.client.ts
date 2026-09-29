import { createKizloClient as createClient, type KizloBrowserClient } from "../../client"
import { getServerBaseUrl } from "./utils"

export interface KizloClientOptions {
	/**
	 * Backend URL. In the browser, pass `import.meta.env.PUBLIC_KIZLO_BASE_URL` at the call site so Vite
	 * inlines it into the client bundle (see the template's `client.ts`); when omitted it falls back to
	 * `PUBLIC_KIZLO_BASE_URL` from `process.env`.
	 */
	url?: string
}

export function createKizloClient(contract: unknown, options?: KizloClientOptions): KizloBrowserClient {
	return createClient(contract, { url: options?.url ?? getServerBaseUrl() })
}
