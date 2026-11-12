import apiFetch from "@wordpress/api-fetch"
import type { Bootstrap } from "./bootstrap"

let posLocked = false
let posConfigured = true
export const setPosLocked = (locked: boolean, configured = true) => {
	posLocked = locked
	posConfigured = configured
}

export type ApiProblem = { message: string; action: "reload" | "login" | null }

export function apiProblem(error: unknown): ApiProblem {
	const value = error as { code?: string; message?: string; data?: { status?: number } } | null
	if (value?.code === "rest_cookie_invalid_nonce") {
		return { message: "Your WordPress session needs to be refreshed. Reload to continue.", action: "reload" }
	}
	if (value?.data?.status === 401) {
		return { message: "Your WordPress session has ended. Sign in again to continue.", action: "login" }
	}
	return { message: value?.message || "The request failed. Please try again.", action: null }
}

export function configureApi(data: Bootstrap): void {
	setPosLocked(data.security?.locked ?? true, data.security?.configured ?? false)
	apiFetch.use(apiFetch.createRootURLMiddleware(data.restRoot))
	apiFetch.use(apiFetch.createNonceMiddleware(data.nonce))
	apiFetch.use(async (options, next) => {
		try {
			const path = options.path ?? ""
			if (
				posLocked &&
				(path.startsWith("/kizlo-pos/v1/") || path.startsWith("/kizlo/v1/pos/")) &&
				!path.startsWith("/kizlo-pos/v1/security")
			) {
				throw {
					code: posConfigured ? "kizlo_pos_locked" : "kizlo_pos_pin_required",
					message: "POS is locked. Unlock it to continue.",
					data: { status: posConfigured ? 423 : 428 },
				}
			}
			return await next(options)
		} catch (error) {
			const status = (error as { data?: { status?: number } })?.data?.status
			if ((status === 423 || status === 428) && !options.signal?.aborted) {
				window.dispatchEvent(new CustomEvent("kizlo-pos-locked", { detail: { configured: status === 423 } }))
			}
			const problem = apiProblem(error)
			if (!options.signal?.aborted && problem.action) {
				window.dispatchEvent(new CustomEvent<ApiProblem>("kizlo-pos-api-error", { detail: problem }))
			}
			throw error
		}
	})
}

export { apiFetch }
