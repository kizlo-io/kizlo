import { type EnvSource, type KizloEnv, readEnv } from "../shared/integration"

/** Map a runtime's environment names onto the values Kizlo consumes. */
export function runtimeEnv(source: EnvSource, baseUrlKey: string): KizloEnv {
	return {
		baseUrl: readEnv(source, baseUrlKey),
		mode: readEnv(source, "KIZLO_MODE"),
		remote: {
			siteSecret: readEnv(source, "KIZLO_WP_SECRET"),
			wordpressUrl: readEnv(source, "KIZLO_WP_URL"),
			wordpressUsername: readEnv(source, "KIZLO_WP_USERNAME"),
			wordpressPassword: readEnv(source, "KIZLO_WP_APP_PASSWORD"),
		},
		local: {
			siteSecret: readEnv(source, "KIZLO_LOCAL_WP_SECRET"),
			wordpressUrl: readEnv(source, "KIZLO_LOCAL_WP_URL"),
			wordpressUsername: readEnv(source, "KIZLO_LOCAL_WP_USERNAME"),
			wordpressPassword: readEnv(source, "KIZLO_LOCAL_WP_APP_PASSWORD"),
		},
	}
}
