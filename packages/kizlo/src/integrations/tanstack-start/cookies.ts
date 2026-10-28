import { deleteCookie, getCookies, setCookie } from "@tanstack/react-start/server"
import type { CookiesAdapter } from "../../shared/types"

export function startCookies(): CookiesAdapter {
	return {
		getAll: () => Object.entries(getCookies()).flatMap(([name, value]) => (value === undefined ? [] : [{ name, value }])),
		setAll: (cookies) => {
			for (const { name, value, options } of cookies) setCookie(name, value, options)
		},
		deleteAll: (cookies) => {
			for (const { name, options } of cookies) deleteCookie(name, options)
		},
	}
}
