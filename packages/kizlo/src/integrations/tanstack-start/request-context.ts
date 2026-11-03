import { getGlobalStartContext } from "@tanstack/start-client-core"
import { getRequest } from "@tanstack/start-server-core/request-response"

/** Read Start's native request scope; no application-owned async storage is needed. */
export function getStartRequestContext(): { request: Request; values: object } | undefined {
	let request: Request
	try {
		request = getRequest()
	} catch {
		return undefined
	}
	let values: object = {}
	try {
		values = getGlobalStartContext() ?? {}
	} catch {
		// Start sets global middleware context after its request middleware has completed.
	}
	return { request, values }
}
