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

export interface CookiesAdapter {
	setAll(cookies: CookieWithOptions[]): Promise<void> | void
	getAll(): Promise<{ name: string; value: string }[] | null> | { name: string; value: string }[] | null
	deleteAll(cookies: { name: string; options?: CookieOptions }[]): Promise<void> | void
}
