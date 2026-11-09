import apiFetch from "@wordpress/api-fetch"
import type { Bootstrap } from "./bootstrap"

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
	apiFetch.use(apiFetch.createRootURLMiddleware(data.restRoot))
	apiFetch.use(apiFetch.createNonceMiddleware(data.nonce))
	apiFetch.use(async (options, next) => {
		try {
			return await next(options)
		} catch (error) {
			const problem = apiProblem(error)
			if (!options.signal?.aborted && problem.action) {
				window.dispatchEvent(new CustomEvent<ApiProblem>("kizlo-pos-api-error", { detail: problem }))
			}
			throw error
		}
	})
}

export { apiFetch }
