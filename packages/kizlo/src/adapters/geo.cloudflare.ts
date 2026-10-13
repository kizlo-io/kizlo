import type { GeoAdapter } from "./geo"

/** Read trusted Cloudflare connection headers in Next.js/vinext. Only use behind Cloudflare ingress. */
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
			const country = headers?.get("cf-ipcountry") || null
			return {
				ip: headers?.get("cf-connecting-ip") || null,
				country: country === "XX" || country === "T1" ? null : country,
				city: null,
				state: null,
				postcode: null,
				timezone: null,
				userAgent: headers?.get("user-agent") || null,
			}
		},
	}
}
