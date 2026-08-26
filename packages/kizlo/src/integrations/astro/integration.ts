import { createIntegration, type EnvSource } from "../../shared/integration"
import { runtimeEnv } from "../runtime-env"

export interface AstroOptions {
	/** Astro's server environment reader, usually `getSecret` from `astro:env/server`. */
	env: EnvSource
}

/** Integrate Kizlo with Astro's server environment. */
export function astro(options: AstroOptions) {
	return createIntegration({
		id: "astro",
		env: runtimeEnv(options.env, "PUBLIC_KIZLO_BASE_URL"),
	})
}
