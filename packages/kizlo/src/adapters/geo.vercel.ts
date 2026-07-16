import type { ConnInfo, GeoAdapter } from "./geo"

export function geoVercelNext(): GeoAdapter {
	return {
		getConnInfo: async (request) => {
			if (request) {
				return readVercelHeaders(request.headers)
			}

			let nextHeaders: Headers
			try {
				const mod = await import("next/headers")
				nextHeaders = (await mod.headers()) as unknown as Headers
			} catch (err) {
				throw new Error(
					"geoVercelNext: no Request was provided and `next/headers` could not be loaded. " +
						"Install `next` as a peer dependency, or pass a Request to the SDK.",
					{ cause: err },
				)
			}

			return readVercelHeaders(nextHeaders)
		},
	}
}

function readVercelHeaders(headers: Headers): ConnInfo {
	const xRealIp = headers.get("x-real-ip")
	const xff = headers.get("x-forwarded-for")
	const ip = xRealIp || xff?.split(",")[0]?.trim() || null

	const country = headers.get("x-vercel-ip-country") || null
	const cityRaw = headers.get("x-vercel-ip-city")
	const tzRaw = headers.get("x-vercel-ip-timezone")

	const userAgent = headers.get("User-Agent")

	const city = cityRaw ? safeDecode(cityRaw) : null
	const timezone = tzRaw ? safeDecode(tzRaw) : null

	return {
		ip,
		country,
		city,
		timezone,
		postcode: null,
		state: null,
		userAgent,
	}
}

function safeDecode(value: string): string | null {
	try {
		return decodeURIComponent(value)
	} catch {
		return value || null
	}
}
