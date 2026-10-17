import type { ConnInfo } from "./geo"

export function cloudflareConnInfo(headers?: Headers): ConnInfo {
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
}
