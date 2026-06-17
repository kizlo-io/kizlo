import type { Promisify } from "@kizlo/shared"

export interface ConnInfo {
	ip: string | null
	country: string | null
	city: string | null
	state: string | null
	postcode: string | null
	timezone: string | null
	userAgent: string | null
}

export interface GeoAdapter {
	getConnInfo(request: Request | null): Promisify<ConnInfo>
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
