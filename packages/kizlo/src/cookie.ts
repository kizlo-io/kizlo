import type { Cookie, CookieOptions, CookieWithOptions } from "@kizlo/shared"
import JsCookies from "js-cookie"
import type { CookiesAdapter } from "./shared/types"

export class CookiesStorage {
	private readonly cookies?: CookiesAdapter

	constructor(cookies?: CookiesAdapter) {
		this.cookies = cookies
	}

	public async get(): Promise<Cookie[]>
	public async get(name: string): Promise<string | null>
	public async get(name?: string): Promise<Cookie[] | (string | null)> {
		const cookies = (await Promise.resolve(this.cookies?.getAll())) ?? []
		if (name) return cookies.find((item) => item.name === name)?.value ?? null
		return cookies
	}

	public async set(cookie: CookieWithOptions): Promise<void>
	public async set(cookies: CookieWithOptions[]): Promise<void>
	public async set(cookieOrCookies: CookieWithOptions | CookieWithOptions[]): Promise<void> {
		const cookies: CookieWithOptions[] = Array.isArray(cookieOrCookies) ? cookieOrCookies : [cookieOrCookies]
		return await Promise.resolve(this.cookies?.setAll(cookies))
	}

	public async delete(name: string, options?: CookieOptions): Promise<void>
	public async delete(cookies: { name: string; options?: CookieOptions }[]): Promise<void>
	public async delete(nameOrCookies: string | { name: string; options?: CookieOptions }[], options?: CookieOptions): Promise<void> {
		return await Promise.resolve(this.cookies?.deleteAll(Array.isArray(nameOrCookies) ? nameOrCookies : [{ name: nameOrCookies, options }]))
	}
}

export class BrowserCookies implements CookiesAdapter {
	setAll(cookies: CookieWithOptions[]): Promise<void> | void {
		cookies.forEach((cookie) => {
			JsCookies.set(cookie.name, cookie.value, cookie.options)
		})
	}

	getAll(): Promise<{ name: string; value: string }[] | null> | { name: string; value: string }[] | null {
		return Object.entries(JsCookies.get()).map(([name, value]) => ({ name, value }))
	}

	deleteAll(cookies: { name: string; options?: CookieOptions }[]): Promise<void> | void {
		for (const cookie of cookies) {
			JsCookies.remove(cookie.name, cookie.options)
		}
	}
}
