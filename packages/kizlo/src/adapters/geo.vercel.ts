import type { ConnInfo, GeoAdapter } from "./geo"

export function geoVercelNext(): GeoAdapter {
	return {
		getConnInfo: async (request) => {
			if (request) {
				return readVercelHeaders(request.headers)
			}

			// Dynamic import so this file loads even when `next` isn't installed —
			// the failure only surfaces if a user actually invokes this adapter
			// without a Request and without Next.js available.
			let nextHeaders: Headers
			try {
				const mod = await import("next/headers")
				// Next 15+ returns Promise<ReadonlyHeaders>; Next 13–14 returns ReadonlyHeaders.
				// Awaiting works for both.
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
	// IP — Vercel sets x-real-ip; x-forwarded-for is the fallback chain
	const xRealIp = headers.get("x-real-ip")
	const xff = headers.get("x-forwarded-for")
	const ip = xRealIp || xff?.split(",")[0]?.trim() || null

	// Geo headers Vercel injects when behind their edge
	const country = headers.get("x-vercel-ip-country") || null
	const cityRaw = headers.get("x-vercel-ip-city")
	const tzRaw = headers.get("x-vercel-ip-timezone")

	const userAgent = headers.get("User-Agent")

	// Vercel URL-encodes city and timezone (e.g. "New%20York", "America%2FNew_York")
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
