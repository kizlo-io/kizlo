import type { CookieOptions, CookieWithOptions } from "@kizlo/shared"
import type { NestedClient } from "@orpc/client"
import type { ListMetadata } from "./schema"

export type AnyContext = Record<PropertyKey, any>

export type AnyNestedClient = NestedClient<any>

export type HTTPMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD"

export type List<T> = { items: T[]; meta: ListMetadata }

export type MaybeOptionalOptions<TOptions> = Record<never, never> extends TOptions ? [options?: TOptions] : [options: TOptions]

export type RedirectStatus = 301 | 302 | 303 | 307 | 308

export interface RedirectInput {
	to: string | URL
	status?: RedirectStatus
	searchParams?: Record<string, string>
}

export type CookiesSetAll = (cookies: CookieWithOptions[]) => Promise<void> | void
export type CookiesGetAll = () => Promise<{ name: string; value: string }[] | null> | { name: string; value: string }[] | null
export type CookiesDeleteAll = (cookies: { name: string; options?: CookieOptions }[]) => Promise<void> | void

export interface CookiesAdapter {
	/** Write the given cookies, each with its options. */
	setAll: CookiesSetAll
	/** Read all cookies as name/value pairs, or `null` when none are available. */
	getAll: CookiesGetAll
	/** Delete the named cookies, honoring each entry's options (e.g. `path`). */
	deleteAll: CookiesDeleteAll
}
