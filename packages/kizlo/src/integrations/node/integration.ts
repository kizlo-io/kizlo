import { createIntegration, type EnvSource } from "../../shared/integration"
import { runtimeEnv } from "../runtime-env"

export interface NodeOptions {
	/** Node environment source. Defaults to `process.env`. */
	env?: EnvSource
}

/** Integrate Kizlo with the Node.js runtime environment. */
export function node(options: NodeOptions = {}) {
	return createIntegration({
		id: "node",
		env: runtimeEnv(options.env ?? process.env, "KIZLO_BASE_URL"),
	})
}
