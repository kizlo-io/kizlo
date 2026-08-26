import type { CookiesAdapter } from "../shared/types"
import type { AuthAdapter } from "./auth"
import type { CaptchaAdapter } from "./captcha"
import type { GeoAdapter } from "./geo"
import type { LoggerAdapter } from "./logger"

/** The service contracts Kizlo integrations can provide at runtime. */
export interface ServiceAdapters {
	auth?: AuthAdapter
	captcha?: CaptchaAdapter
	geo?: GeoAdapter
	logger?: LoggerAdapter
	cookies?: CookiesAdapter
}

/** Merge adapter contributions in order without letting `undefined` erase an earlier value. */
export function mergeServiceAdapters(...contributions: (ServiceAdapters | undefined)[]): ServiceAdapters {
	const adapters: ServiceAdapters = {}

	for (const contribution of contributions) {
		if (!contribution) continue
		if (contribution.auth !== undefined) adapters.auth = contribution.auth
		if (contribution.captcha !== undefined) adapters.captcha = contribution.captcha
		if (contribution.geo !== undefined) adapters.geo = contribution.geo
		if (contribution.logger !== undefined) adapters.logger = contribution.logger
		if (contribution.cookies !== undefined) adapters.cookies = contribution.cookies
	}

	return adapters
}
