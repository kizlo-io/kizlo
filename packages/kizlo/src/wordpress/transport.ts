import {
	type Duration,
	milliseconds,
	type SearchParamsLike,
	stringifyQueryString,
	type TryCatchResult,
	trimLeadingTrailingSlashes,
	tryCatch,
	tryCatchSync,
} from "@kizlo/shared"
import { SAFE_REQUEST_TIMEOUT, UNEXPECTED_BODY_SNIPPET_LENGTH, WP_AUTH_HEADER_KEY, WP_AUTH_TYPE } from "./constants"
import { WP_Error } from "./error"
import type { WordPressCredentials, WP_List, WP_ListMetadata, WP_RequestContentType, WP_RequestInput, WP_Result } from "./types"
import { isWordPressResourceError } from "./utils"

export interface WordPressTransportOptions {
	credentials: WordPressCredentials
	timeout?: Duration
	onResponse?: (headers: Headers) => void
	onResult?: (result: WordPressTransportResult) => void
}

export interface WordPressTransportResult {
	url: string
	status: number
	headers: Headers
}

export class WordPressTransport {
	private readonly siteBase: string
	private readonly authHeader: string
	private readonly defaultTimeout: Duration
	/** Called with the response headers of every non-transport-error response, so callers can observe
	 * per-response signals (e.g. the plugin version header) without threading them through every method. */
	private readonly onResponse?: (headers: Headers) => void
	/** Called after every request attempt, including transport failures, with the URL and response metadata. */
	private readonly onResult?: (result: WordPressTransportResult) => void

	constructor(context: WordPressTransportOptions) {
		const credentialBytes = new TextEncoder().encode(`${context.credentials.username}:${context.credentials.password}`)
		let binary = ""
		for (const byte of credentialBytes) binary += String.fromCharCode(byte)
		const encoded = btoa(binary)
		this.authHeader = `${WP_AUTH_TYPE} ${encoded}`
		this.siteBase = context.credentials.url.endsWith("/") ? context.credentials.url : `${context.credentials.url}/`
		this.defaultTimeout = context.timeout ?? SAFE_REQUEST_TIMEOUT
		this.onResponse = context.onResponse
		this.onResult = context.onResult
	}

	public async post<TData, TCode extends string = never>(
		path: string,
		input: {
			body?: unknown
			base?: string
			headers?: Record<string, string>
			searchParams?: SearchParamsLike
			signal?: AbortSignal
			timeout?: Duration
		},
	): Promise<WP_Result<TData, TCode>> {
		return this.request<TData, TCode>({ ...input, path, method: "POST" })
	}

	public async get<TData, TCode extends string = never>(
		path: string,
		input: {
			base?: string
			headers?: Record<string, string>
			searchParams?: SearchParamsLike
			signal?: AbortSignal
			timeout?: Duration
		},
	): Promise<WP_Result<TData, TCode>> {
		return this.request<TData, TCode>({ ...input, path, method: "GET" })
	}

	public async put<TData, TCode extends string = never>(
		path: string,
		input: {
			body: unknown
			base?: string
			headers?: Record<string, string>
			searchParams?: SearchParamsLike
			signal?: AbortSignal
			timeout?: Duration
		},
	): Promise<WP_Result<TData, TCode>> {
		return this.request<TData, TCode>({ ...input, path, method: "PUT" })
	}

	public async patch<TData, TCode extends string = never>(
		path: string,
		input: {
			body: unknown
			base?: string
			headers?: Record<string, string>
			searchParams?: SearchParamsLike
			signal?: AbortSignal
			timeout?: Duration
		},
	): Promise<WP_Result<TData, TCode>> {
		return this.request<TData, TCode>({ ...input, path, method: "PATCH" })
	}

	public async delete<TData, TCode extends string = never>(
		path: string,
		input: {
			body?: unknown
			base?: string
			headers?: Record<string, string>
			searchParams?: SearchParamsLike
			signal?: AbortSignal
			timeout?: Duration
		},
	): Promise<WP_Result<TData, TCode>> {
		return this.request<TData, TCode>({ ...input, path, method: "DELETE" })
	}

	public resolveList<T>(response: { data: T[]; headers: Headers; searchParams?: SearchParamsLike }): WP_List<T> {
		const totalItems = Number(response.headers.get("x-wp-total") ?? "0")
		const totalPages = Number(response.headers.get("x-wp-totalpages") ?? "0")
		const page = +(response.searchParams?.page ?? "1")
		const meta = this.resolveListMetadata({ page, totalItems, totalPages })
		return { items: response.data, meta }
	}

	public resolveListMetadata(params: { page: number; totalPages: number; totalItems: number }): WP_ListMetadata {
		const page = Math.max(params.page, 1)
		const next_page = params.totalPages > page ? page + 1 : null
		const prev_page = page > 1 ? page - 1 : null
		const has_next_page = !!next_page
		const has_prev_page = page > 1

		return {
			page,
			next_page,
			prev_page,
			has_next_page,
			has_prev_page,
			total_pages: params.totalPages,
			total_items: params.totalItems,
		}
	}

	public async request<TData, TCode extends string = never>(input: WP_RequestInput): Promise<WP_Result<TData, TCode>> {
		const { outcome, url } = await this.#fetch(input)
		const [transportErr, response] = outcome

		if (transportErr) {
			const result = {
				data: null,
				status: 0,
				headers: new Headers(),
				error: new WP_Error<TCode>({ code: "unknown_error", message: transportErr.message }),
			}
			this.onResult?.({ url, status: result.status, headers: result.headers })
			return result
		}

		this.onResponse?.(response.headers)
		this.onResult?.({ url, status: response.status, headers: response.headers })

		const expectedContentType = input.responseContentTypes?.[String(response.status)] ?? input.responseContentTypes?.default
		const acceptsData =
			response.ok ||
			input.dataResponseStatuses?.includes(String(response.status)) === true ||
			input.dataResponseStatuses?.includes("default") === true
		const contentType =
			response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() || expectedContentType || "application/json"
		let body: Blob | string
		try {
			body = contentType === "application/octet-stream" ? await response.blob() : await response.text()
		} catch (error) {
			return {
				data: null,
				status: response.status,
				headers: response.headers,
				error: new WP_Error<TCode>({ code: "unknown_error", message: error instanceof Error ? error.message : String(error) }),
			}
		}

		if (acceptsData && typeof body === "string" && body.trim() === "") {
			return { data: null as TData, status: response.status, headers: response.headers, error: null }
		}

		let parseErr: Error | null = null
		let data: TData
		if (contentType === "application/json" || contentType.endsWith("+json")) {
			const parsed = tryCatchSync<TData>(() => JSON.parse(body as string))
			parseErr = parsed[0]
			data = parsed[1] as TData
		} else {
			data = body as TData
		}

		if (!response.ok) {
			if (isWordPressResourceError<TCode>(data)) {
				return {
					data: null,
					status: response.status,
					headers: response.headers,
					error: new WP_Error<TCode>({ code: data.code, message: data.message, data: data.data }),
				}
			}

			if (!acceptsData) {
				return {
					data: null,
					status: response.status,
					headers: response.headers,
					error: new WP_Error<TCode>({ code: "unexpected_error", message: this.#snippet(String(body)) }),
				}
			}
		}

		if (parseErr) {
			return {
				data: null,
				status: response.status,
				headers: response.headers,
				error: new WP_Error<TCode>({ code: "unexpected_error", message: this.#snippet(String(body)) }),
			}
		}

		return { data, status: response.status, headers: response.headers, error: null }
	}

	/**
	 * Preparing the request is inside the same `tryCatch` as sending it, because preparing can fail
	 * too: a body that will not serialize, a path that will not resolve. Those are reported the way a
	 * refused connection is rather than rejecting, so no call through a generated endpoint throws.
	 */
	async #fetch(input: WP_RequestInput): Promise<{ outcome: TryCatchResult<Response, Error>; url: string }> {
		let url = this.siteBase
		const outcome = await tryCatch(
			(async () => {
				const resolved = this.resolveUrl(input)
				if (input.searchParams) {
					const params = new URLSearchParams(stringifyQueryString(input.searchParams))
					for (const [key, value] of params) resolved.searchParams.append(key, value)
				}
				url = resolved.toString()
				return this.#send(input, resolved)
			})(),
		)
		return { outcome, url }
	}

	async #send(input: WP_RequestInput, url: URL): Promise<Response> {
		const body = this.#serializeBody(input.body, input.requestContentType)
		const isFormData = body instanceof FormData

		const headers: Record<string, string> = {
			...(body !== undefined && !isFormData && { "Content-Type": input.requestContentType ?? "application/json" }),
			...input.headers,
			[WP_AUTH_HEADER_KEY]: this.authHeader,
		}

		const hasBody = !["GET", "DELETE", "HEAD", "OPTIONS"].includes(input.method)

		return fetch(url.toString(), {
			headers,
			method: input.method,
			signal: this.#resolveSignal(input),
			...(hasBody && body !== undefined ? { body } : {}),
		})
	}

	#serializeBody(body: unknown, contentType: WP_RequestContentType | undefined): BodyInit | undefined {
		if (body === undefined || body === null) return undefined
		if (body instanceof FormData || body instanceof URLSearchParams || typeof body === "string" || body instanceof Blob) return body
		if (contentType === "multipart/form-data") {
			const form = new FormData()
			this.#appendFormData(form, "", body)
			return form
		}
		if (contentType === "application/x-www-form-urlencoded") {
			return new URLSearchParams(stringifyQueryString(body as SearchParamsLike))
		}
		return JSON.stringify(body)
	}

	#appendFormData(form: FormData, prefix: string, value: unknown): void {
		if (value === undefined || value === null) return
		if (value instanceof Blob) {
			form.append(prefix, value)
			return
		}
		if (Array.isArray(value)) {
			value.forEach((item, index) => {
				this.#appendFormData(form, `${prefix}[${index}]`, item)
			})
			return
		}
		if (typeof value === "object") {
			for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
				this.#appendFormData(form, prefix ? `${prefix}[${key}]` : key, child)
			}
			return
		}
		form.append(prefix, String(value))
	}

	#resolveSignal(input: WP_RequestInput): AbortSignal {
		const timeoutSignal = AbortSignal.timeout(milliseconds(input.timeout ?? this.defaultTimeout))
		return input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal
	}

	public resolveUrl(requestConfig: WP_RequestInput) {
		const baseSegment = requestConfig.base ? `${trimLeadingTrailingSlashes(requestConfig.base)}/` : ""
		const pathSegment = trimLeadingTrailingSlashes(requestConfig.path)
		return new URL(`${baseSegment}${pathSegment}`, this.siteBase)
	}

	#snippet(text: string): string {
		return text.length > UNEXPECTED_BODY_SNIPPET_LENGTH ? `${text.slice(0, UNEXPECTED_BODY_SNIPPET_LENGTH)}…` : text
	}
}
