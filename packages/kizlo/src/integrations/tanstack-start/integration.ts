import { FRAMEWORK_INTEGRATION_ORDER } from "../../shared/constants"
import { createIntegration, type EnvSource } from "../../shared/integration"
import { runtimeEnv } from "../runtime-env"
import { startCookies } from "./cookies"
import { getStartRequestContext } from "./request-context"

export interface TanstackStartOptions {
	/** Environment source. Defaults to `process.env`. */
	env?: EnvSource
}

/** Integrate Kizlo with the TanStack Start server runtime. */
export function tanstackStart(options: TanstackStartOptions = {}) {
	const source = options.env ?? process.env

	return createIntegration({
		id: "tanstack-start",
		order: FRAMEWORK_INTEGRATION_ORDER,
		adapters: { cookies: startCookies(), requestContext: { get: getStartRequestContext } },
		env: runtimeEnv(source, "VITE_KIZLO_BASE_URL"),
	})
}
