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

/**
 * Per-call overrides. The definition describes the endpoint, these describe this one invocation:
 * what the caller knows only at the moment of calling. Headers belong here rather than on the
 * definition because a request can carry per-caller state (a guest cart token, the caller's geo)
 * that the route it travels to has no way to declare.
 */
export type WP_CallOptions = Pick<WP_RequestInput, "signal" | "timeout" | "headers">

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

type WP_EndpointCallResult<TEndpoint> =
	IsAny<TEndpoint> extends true ? any : TEndpoint extends (input: never) => Promise<infer TResult> ? TResult : never

/**
 * `never` is short-circuited rather than let through: every type is assignable to it, so an
 * unresolved path would otherwise match the `{ data: infer TData }` branch and infer `unknown`,
 * turning a misspelt path into a loose type instead of a missing one.
 */
type WP_EndpointSuccessData<TEndpoint> =
	IsAny<TEndpoint> extends true
		? any
		: [TEndpoint] extends [never]
			? never
			: Extract<WP_EndpointCallResult<TEndpoint>, { error: null }> extends { data: infer TData }
				? TData
				: never

/**
 * The success payload of a generated endpoint, addressed by the dotted path the client nests it
 * under. Kizlo's own modules use this instead of re-declaring WordPress shapes by hand, and it
 * resolves against whichever client is compiling, so it stays well-formed in a project that has
 * not generated one yet (`any`) or whose WordPress does not serve the endpoint (`never`).
 */
export type WP_EndpointData<TPath extends string> = WP_EndpointSuccessData<WP_EndpointAtPath<ActiveWordPressClient, TPath>>

/**
 * Everything a generated endpoint resolves to, success and failure alike, addressed the same way.
 * {@link WP_EndpointData} is the success payload on its own; this is what a signature that has to
 * name the whole result uses, so a service can publish its return type without the project's
 * generated module leaking into the package's own declarations.
 */
export type WP_EndpointResult<TPath extends string> = WP_EndpointCallResult<WP_EndpointAtPath<ActiveWordPressClient, TPath>>

type WP_EndpointCallInput<TEndpoint> =
	IsAny<TEndpoint> extends true ? any : TEndpoint extends (...args: infer TArguments) => unknown ? Exclude<TArguments[0], undefined> : never

/**
 * What a generated endpoint accepts, addressed the same way as {@link WP_EndpointData}. Kizlo's own
 * modules name their WordPress payloads with this rather than restating them, so an input can only
 * drift from the route it is sent to by the route itself changing.
 */
export type WP_EndpointInput<TPath extends string> = WP_EndpointCallInput<WP_EndpointAtPath<ActiveWordPressClient, TPath>>

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

type WP_DeclaredHeaderName<T extends Record<string, unknown>> = string extends keyof T ? never : Extract<keyof T, string>

type WP_RequiredHeaderName<T extends Record<string, unknown>> = {
	[TName in WP_DeclaredHeaderName<T>]-?: undefined extends T[TName] ? never : TName
}[WP_DeclaredHeaderName<T>]

type WP_ReadableHeaders<THeaderName extends string> = {
	get<TName extends THeaderName | (string & Record<never, never>)>(name: TName): string | null
}

type WP_RequiredHeaders<THeaders extends Record<string, unknown>> = [WP_RequiredHeaderName<THeaders>] extends [never]
	? object
	: {
			get<TName extends string>(name: Lowercase<TName> extends Lowercase<WP_RequiredHeaderName<THeaders>> ? TName : never): string
		}

/**
 * Response headers keep the open `Headers` API, but a literal name the endpoint requires cannot be
 * absent. The declared spellings stay visible to editor completion while the open string member
 * accepts any other header, and lowercasing both sides follows the case-insensitive runtime API.
 */
export type WP_TypedHeaders<THeaders extends Record<string, unknown>, THeaderName extends string = WP_DeclaredHeaderName<THeaders>> = Omit<
	Headers,
	"get"
> &
	WP_RequiredHeaders<THeaders> &
	WP_ReadableHeaders<THeaderName>

export type WP_Success<
	TData,
	TStatus extends number = number,
	THeaders extends Record<string, unknown> = Record<string, never>,
	THeaderName extends string = string,
> = {
	data: TData
	status: TStatus
	headers: WP_TypedHeaders<THeaders, THeaderName>
	error: null
}

export type WP_Failure<
	TError extends string,
	TStatus extends number = number,
	THeaders extends Record<string, unknown> = Record<string, never>,
	THeaderName extends string = string,
> = {
	data: null
	status: TStatus
	headers: WP_TypedHeaders<THeaders, THeaderName>
	error: WP_Error<TError>
}

export type WP_TransportFailure<TError extends string, THeaderName extends string = string> = WP_Failure<
	TError,
	0,
	Record<string, never>,
	THeaderName
>

export type WP_Result<TData, TError extends string> = WP_Success<TData> | WP_Failure<TError>
