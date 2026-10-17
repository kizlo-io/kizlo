import { FRAMEWORK_INTEGRATION_ORDER } from "../../shared/constants"
import { createIntegration } from "../../shared/integration"
import { geoCloudflare } from "./request-context"

/** Supply Cloudflare connection info independently of the frontend framework or WordPress host. */
export function cloudflare() {
	return createIntegration({
		id: "cloudflare",
		order: FRAMEWORK_INTEGRATION_ORDER,
		adapters: { geo: geoCloudflare() },
	})
}
