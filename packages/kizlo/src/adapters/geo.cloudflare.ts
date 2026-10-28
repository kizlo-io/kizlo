import { cloudflareConnInfo } from "./cloudflare-connection"
import type { GeoAdapter } from "./geo"

/** Read trusted Cloudflare connection headers in Next.js. Only use behind Cloudflare ingress. */
export function geoCloudflareNext(): GeoAdapter {
	return {
		getConnInfo: async (request) => {
			let headers = request?.headers
			if (!headers) {
				try {
					headers = await (await import("next/headers")).headers()
				} catch {
					// Builds and background jobs have no visitor request.
				}
			}
			return cloudflareConnInfo(headers)
		},
	}
}
