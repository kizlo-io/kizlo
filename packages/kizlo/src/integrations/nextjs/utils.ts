import { KizloError } from "../../shared/error"
import type { CookiesAdapter } from "../../shared/types"

export function createNextCookiesInterface(): CookiesAdapter {
	return {
		getAll: async () => {
			const cookies = (await import("next/headers")).cookies
			const cookie = await cookies()
			return cookie.getAll()
		},
		setAll: async (cookieList) => {
			const cookies = (await import("next/headers")).cookies
			const cookieJar = await cookies()

			try {
				for (const cookie of cookieList) cookieJar.set(cookie.name, cookie.value, cookie.options)
			} catch {
				// In react server components, nextjs throws error due to
				// the use of cookies mutations, We can ignore just ignore the error.
			}
		},
		deleteAll: async (cookieList) => {
			const cookies = (await import("next/headers")).cookies
			const cookieJar = await cookies()

			try {
				for (const cookie of cookieList) cookieJar.delete(cookie.name)
			} catch {
				// In react server components, nextjs throws error due to
				// the use of cookies mutations, We can ignore just ignore the error.
			}
		},
	}
}

export function getServerBaseUrl() {
	const baseUrl = process.env.NEXT_PUBLIC_KIZLO_BACKEND_URL
	if (!baseUrl) {
		throw new KizloError("MISSING_ENV_VARIABLE", {
			message: "Please define NEXT_PUBLIC_KIZLO_BACKEND_URL in your .env file.",
		})
	}
	return baseUrl
}
