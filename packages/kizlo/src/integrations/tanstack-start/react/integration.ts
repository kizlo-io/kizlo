import { tanstackStart as baseStart, type TanstackStartOptions } from "../integration"
import { startCookies } from "./cookies"
import { getStartRequestContext } from "./request-context"

/** Add React Start's native request context and cookies to the shared environment mapping. */
export function tanstackStart(options: TanstackStartOptions = {}) {
	return {
		...baseStart(options),
		adapters: { cookies: startCookies(), requestContext: { get: getStartRequestContext } },
	}
}
