import type { Promisify } from "@kizlo/shared"

export interface ConnInfo {
	/** Client IP address, or `null` if unavailable. */
	ip: string | null
	/** ISO country code, or `null`. */
	country: string | null
	/** City name, or `null`. */
	city: string | null
	/** Region/state, or `null`. */
	state: string | null
	/** Postal code, or `null`. */
	postcode: string | null
	/** IANA timezone, or `null`. */
	timezone: string | null
	/** The request's `User-Agent`, or `null`. */
	userAgent: string | null
}

export type GeoGetConnInfo = (request: Request | null) => Promisify<ConnInfo>

export interface GeoAdapter {
	/** Resolve connection info (IP, geo, user agent) from the request. Return the shape with `null` fields when unknown — never throw. Receives `null` server-side. */
	getConnInfo: GeoGetConnInfo
}

/** Author a custom geo adapter, typed against the {@link GeoAdapter} contract. */
export function createGeoAdapter(adapter: GeoAdapter): GeoAdapter {
	return adapter
}

export function geoMock(values?: Partial<ConnInfo>): GeoAdapter {
	return {
		getConnInfo(request) {
			return {
				ip: "49.205.46.133",
				city: "DL",
				state: "HR",
				country: "IN",
				postcode: "110058",
				userAgent: request?.headers.get("User-Agent") ?? null,
				timezone: null,
				...values,
			}
		},
	}
}
