import type { Duration, SearchParamsLike } from "@kizlo/shared"
import type { WP_Error } from "./error"

export interface WP_Link {
	href: string
	embeddable?: boolean
	taxonomy?: string
	templated?: boolean
}

export type WP_ListOrder = "asc" | "desc"

export type WP_Context = "view" | "embed" | "edit"

export type WP_CommonErrorCode =
	| "rest_invalid_param"
	| "rest_missing_callback_param"
	| "rest_forbidden"
	| "rest_no_route"
	| "rest_cookie_invalid_nonce"
	| "unexpected_error"
	| "unknown_error"

export interface WP_ErrorData<T extends string> {
	code: T | WP_CommonErrorCode
	message: string
}

export interface WP_ListMetadata {
	page: number
	total_items: number
	total_pages: number
	next_page: number | null
	prev_page: number | null
	has_next_page: boolean
	has_prev_page: boolean
}

export interface WP_List<T> {
	items: T[]
	meta: WP_ListMetadata
}

export interface WP_CurrencyFormat {
	currency_code: string
	currency_symbol: string
	currency_minor_unit: number
	currency_decimal_separator: string
	currency_thousand_separator: string
	currency_prefix: string
	currency_suffix: string
}

export interface WP_RequestInput {
	path: string
	body?: unknown
	base?: string
	searchParams?: SearchParamsLike
	headers?: Record<string, string>
	method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
	signal?: AbortSignal
	timeout?: Duration
}

export interface WordPressCredentials {
	url: string
	username: string
	password: string
}

export type WP_Result<TData, TError extends string> =
	| { data: TData; status: number; headers: Headers; error: null }
	| { data: null; status: number; headers: Headers; error: WP_Error<TError> }
