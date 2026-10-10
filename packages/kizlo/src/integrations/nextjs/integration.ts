import { FRAMEWORK_INTEGRATION_ORDER } from "../../shared/constants"
import { createIntegration, type EnvSource } from "../../shared/integration"
import { runtimeEnv } from "../runtime-env"
import { type NextRevalidateOptions, nextRevalidation } from "./revalidate"
import { createNextCookiesInterface } from "./utils"

export interface NextjsOptions {
	/** Environment source. Defaults to `process.env`. */
	env?: EnvSource
	/** Configure automatic cache revalidation, or disable it with `false`. */
	revalidate?: boolean | NextRevalidateOptions
}

/** Integrate Kizlo with the Next.js server runtime. */
export function nextjs(options: NextjsOptions = {}) {
	const source = options.env ?? process.env
	const revalidation = options.revalidate

	return createIntegration({
		id: "nextjs",
		order: FRAMEWORK_INTEGRATION_ORDER,
		adapters: { cookies: createNextCookiesInterface() },
		env: runtimeEnv(source, "NEXT_PUBLIC_KIZLO_BASE_URL"),
		events: revalidation === false ? undefined : nextRevalidation(typeof revalidation === "object" ? revalidation : undefined).events,
	})
}
