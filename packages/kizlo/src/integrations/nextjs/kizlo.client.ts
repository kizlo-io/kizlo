import { KizloClient } from "../../client"
import type { AnyProcedureRouter } from "../../shared/procedure"
import { getServerBaseUrl } from "./utils"

export interface KizloClientOptions {
	url?: string
}

export function createKizloClient<T extends AnyProcedureRouter>(contract: T, options?: KizloClientOptions): KizloClient<T> {
	const url = options?.url ?? getServerBaseUrl()
	return new KizloClient({ url, contract })
}
