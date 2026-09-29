import { createKizloClient as createClient, type KizloBrowserClient } from "../../client"
import { getServerBaseUrl } from "./utils"

export interface KizloClientOptions {
	url?: string
}

export function createKizloClient(contract: unknown, options?: KizloClientOptions): KizloBrowserClient {
	return createClient(contract, { url: options?.url ?? getServerBaseUrl() })
}
