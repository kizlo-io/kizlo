import { createIntegration, type EnvSource } from "../../shared/integration"
import { runtimeEnv } from "../runtime-env"

export interface TanstackStartOptions {
	/** Environment source. Defaults to `process.env`. */
	env?: EnvSource
}

/** Integrate Kizlo with the TanStack Start server runtime. */
export function tanstackStart(options: TanstackStartOptions = {}) {
	const source = options.env ?? process.env

	return createIntegration({
		id: "tanstack-start",
		env: runtimeEnv(source, "VITE_KIZLO_BASE_URL"),
	})
}
