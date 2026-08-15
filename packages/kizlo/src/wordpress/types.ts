import type { Duration, SearchParamsLike } from "@kizlo/shared"
import type { WP_Error } from "./error"
import type { WordPressTransport } from "./transport"

/**
 * One endpoint as data: its definition, plus the two types the call site needs. Both extra members
 * are phantom — nothing assigns them, and they erase at build. Carrying them on the definition
 * itself is what lets a leaf stay inert data rather than a function that has to be invoked to
 * reveal what it describes.
 */
export interface WP_Endpoint<TInput, TResult> extends WP_EndpointDefinition {
	/** Phantom. Carries the endpoint's input type; never present at runtime. */
	readonly input?: TInput
	/** Phantom. Carries the endpoint's result type; never present at runtime. */
	readonly result?: TResult
}

/** Per-call overrides. The definition describes the endpoint, these describe this one invocation. */
export type WP_CallOptions = Pick<WP_RequestInput, "signal" | "timeout">

/**
 * The callable shape of an endpoint tree: every definition leaf becomes the request it runs. `any`
 * passes through so the stub tree a project carries before its first generation stays callable.
 */
export type WP_Client<T> = {
	[K in keyof T]: IsAny<T[K]> extends true
		? any
		: T[K] extends WP_Endpoint<infer TInput, infer TResult>
			? (...args: WP_CallArguments<TInput>) => Promise<TResult>
			: WP_Client<T[K]>
}

/**
 * Input is only worth demanding when the endpoint has a field that must be supplied. An endpoint
 * whose fields are all optional, or that takes none at all, is callable bare rather than with an
 * empty object passed to satisfy a parameter that carries nothing.
 */
type WP_CallArguments<TInput> =
	Record<string, never> extends TInput ? [input?: TInput, options?: WP_CallOptions] : [input: TInput, options?: WP_CallOptions]

/** True only for `any` — the shape every path has before a project has generated its client. */
type IsAny<T> = 0 extends 1 & T ? true : false

/** Generated WordPress endpoint trees augment this registry in the project that owns them. */
export interface WordPressClientRegistry {}

/**
 * The WordPress client this project compiles against: its generated endpoints bound to the
 * transport, or the bare transport. The stub written before the first generation registers `any`,
 * so a freshly scaffolded project compiles against endpoints it has not described yet.
 */
export type ActiveWordPressClient = WordPressClientRegistry extends { endpoints: infer TEndpoints extends object }
	? WP_Client<TEndpoints> & WordPressTransport
	: WordPressTransport

/** Walk a dotted endpoint path (`postTypes.post.retrieve`) into the active client. */
type WP_EndpointAtPath<TClient, TPath extends string> = TPath extends `${infer TKey}.${infer TRest}`
	? TKey extends keyof TClient
		? WP_EndpointAtPath<TClient[TKey], TRest>
		: never
	: TPath extends keyof TClient
		? TClient[TPath]
		: never

type WP_EndpointSuccessData<TEndpoint> =
	IsAny<TEndpoint> extends true
		? any
		: TEndpoint extends (input: never) => Promise<infer TResult>
			? Extract<TResult, { error: null }> extends { data: infer TData }
				? TData
				: never
			: never

/**
 * The success payload of a generated endpoint, addressed by the dotted path the client nests it
 * under. Kizlo's own modules use this instead of re-declaring WordPress shapes by hand — and
 * it resolves against whichever client is compiling, so it stays well-formed in a project that has
 * not generated one yet (`any`) or whose WordPress does not serve the endpoint (`never`).
 */
export type WP_EndpointData<TPath extends string> = WP_EndpointSuccessData<WP_EndpointAtPath<ActiveWordPressClient, TPath>>

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
	method: WP_RequestMethod
	requestContentType?: WP_RequestContentType
	responseContentTypes?: Record<string, WP_ResponseContentType | undefined>
	signal?: AbortSignal
	timeout?: Duration
}

export type WP_RequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS"

export type WP_RequestContentType = "application/json" | "multipart/form-data" | "application/x-www-form-urlencoded"

export type WP_ResponseContentType =
	| "application/json"
	| "text/plain"
	| "text/html"
	| "application/xml"
	| "text/csv"
	| "application/octet-stream"

export interface WP_EndpointDefinition {
	namespace: string
	path: string
	method: WP_RequestMethod
	pathParameters: string[]
	requestContentType?: WP_RequestContentType
	responseContentTypes: Record<string, WP_ResponseContentType | undefined>
}

export interface WordPressCredentials {
	url: string
	username: string
	password: string
}

export type WP_TypedHeaders<T extends Record<string, unknown>> = Headers & { readonly __kizloHeaders?: T }

export type WP_Success<TData, TStatus extends number = number, THeaders extends Record<string, unknown> = Record<string, never>> = {
	data: TData
	status: TStatus
	headers: WP_TypedHeaders<THeaders>
	error: null
}

export type WP_Failure<
	TError extends string,
	TStatus extends number = number,
	THeaders extends Record<string, unknown> = Record<string, never>,
> = {
	data: null
	status: TStatus
	headers: WP_TypedHeaders<THeaders>
	error: WP_Error<TError>
}

export type WP_TransportFailure<TError extends string> = WP_Failure<TError, 0>

export type WP_Result<TData, TError extends string> = WP_Success<TData> | WP_Failure<TError>
