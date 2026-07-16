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
			} catch {}
		},
		deleteAll: async (cookieList) => {
			const cookies = (await import("next/headers")).cookies
			const cookieJar = await cookies()

			try {
				for (const cookie of cookieList) cookieJar.delete(cookie.name)
			} catch {}
		},
	}
}

/**
 * Wrap a core route handler in a lazily-initialised `unstable_cache` keyed by
 * `cacheTag`, serving the handler's text body with a fixed `Content-Type`. The
 * cache import is deferred so the module stays loadable outside a Next request.
 */
export function createCachedTextRoute(handler: (request: Request) => Promise<Response>, cacheTag: string, contentType: string) {
	let getBody: (() => Promise<string>) | undefined

	return async function GET(request: Request): Promise<Response> {
		if (!getBody) {
			const { unstable_cache } = await import("next/cache")
			getBody = unstable_cache(async () => (await handler(request)).text(), [cacheTag], { tags: [cacheTag] })
		}

		return new Response(await getBody(), { headers: { "Content-Type": contentType } })
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
