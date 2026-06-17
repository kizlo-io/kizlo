import { UAParser } from "ua-parser-js"

export function parseUserAgent(userAgent: string) {
	const parser = new UAParser(userAgent)

	return {
		browser() {
			const value = parser.getBrowser()
			return {
				name: value.name,
				version: value.version,
				majorVersion: value.major,
			}
		},
		device() {
			return parser.getDevice().type
		},
		os() {
			const value = parser.getOS()
			return { name: value.name, version: value.version }
		},
		result() {
			return {
				os: this.os(),
				device: this.device(),
				browser: this.browser(),
			}
		},
	}
}
