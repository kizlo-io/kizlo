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
import { CategoryService } from "./category/service"
import { CommentService } from "./comment/service"
import { SAFE_REQUEST_TIMEOUT, UNEXPECTED_BODY_SNIPPET_LENGTH, WP_AUTH_HEADER_KEY, WP_AUTH_TYPE } from "./constants"
import { WP_Error } from "./error"
import { MenuService } from "./menu/service"
import { PostService } from "./post/service"
import type { WordPressCredentials, WP_List, WP_ListMetadata, WP_RequestInput, WP_Result } from "./types"
import { UserService } from "./user/service"
import { isWordPressResourceError } from "./utils"

export class WordPressService {
	public readonly users = new UserService(this)
	public readonly comments = new CommentService(this)
	public readonly categories = new CategoryService(this)
	public readonly posts = new PostService(this)
	public readonly menus = new MenuService(this)

	private readonly siteBase: string
	private readonly authHeader: string
	private readonly defaultTimeout: Duration

	constructor(context: { credentials: WordPressCredentials; timeout?: Duration }) {
		const credentialBytes = new TextEncoder().encode(`${context.credentials.username}:${context.credentials.password}`)
		let binary = ""
		for (const byte of credentialBytes) binary += String.fromCharCode(byte)
		const encoded = btoa(binary)
		this.authHeader = `${WP_AUTH_TYPE} ${encoded}`
		this.siteBase = context.credentials.url.endsWith("/") ? context.credentials.url : `${context.credentials.url}/`
		this.defaultTimeout = context.timeout ?? SAFE_REQUEST_TIMEOUT
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
		const [transportErr, response] = await this.fetch(input)

		if (transportErr) {
			return {
				data: null,
				status: 0,
				headers: new Headers(),
				error: new WP_Error<TCode>({ code: "unknown_error", message: transportErr.message }),
			}
		}

		const [readErr, text] = await tryCatch(response.text())

		if (readErr) {
			return {
				data: null,
				status: response.status,
				headers: response.headers,
				error: new WP_Error<TCode>({ code: "unknown_error", message: readErr.message }),
			}
		}

		if (response.ok && text.trim() === "") {
			return { data: null as TData, status: response.status, headers: response.headers, error: null }
		}

		const [parseErr, data] = tryCatchSync<TData>(() => JSON.parse(text))

		if (!response.ok) {
			if (isWordPressResourceError<TCode>(data)) {
				return {
					data: null,
					status: response.status,
					headers: response.headers,
					error: new WP_Error<TCode>({ code: data.code, message: data.message }),
				}
			}

			return {
				data: null,
				status: response.status,
				headers: response.headers,
				error: new WP_Error<TCode>({ code: "unexpected_error", message: this.snippet(text) }),
			}
		}

		if (parseErr) {
			return {
				data: null,
				status: response.status,
				headers: response.headers,
				error: new WP_Error<TCode>({ code: "unexpected_error", message: this.snippet(text) }),
			}
		}

		return { data, status: response.status, headers: response.headers, error: null }
	}

	private async fetch(input: WP_RequestInput): Promise<TryCatchResult<Response, Error>> {
		const url = this.resolveUrl(input)

		if (input.searchParams) {
			const params = new URLSearchParams(stringifyQueryString(input.searchParams))
			for (const [k, v] of params) url.searchParams.append(k, v)
		}

		if (!url.searchParams.has("context")) url.searchParams.set("context", "edit")

		const isFormData = input.body instanceof FormData

		const headers: Record<string, string> = {
			...(!isFormData && { "Content-Type": "application/json" }),
			...input.headers,
			[WP_AUTH_HEADER_KEY]: this.authHeader,
		}

		const hasBody = input.method !== "GET" && input.method !== "DELETE"

		return tryCatch(
			fetch(url.toString(), {
				headers,
				method: input.method,
				signal: this.resolveSignal(input),
				...(hasBody && input.body ? { body: isFormData ? (input.body as FormData) : JSON.stringify(input.body) } : {}),
			}),
		)
	}

	private resolveSignal(input: WP_RequestInput): AbortSignal {
		const timeoutSignal = AbortSignal.timeout(milliseconds(input.timeout ?? this.defaultTimeout))
		return input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal
	}

	public resolveUrl(requestConfig: WP_RequestInput) {
		const baseSegment = requestConfig.base ? `${trimLeadingTrailingSlashes(requestConfig.base)}/` : ""
		const pathSegment = trimLeadingTrailingSlashes(requestConfig.path)
		return new URL(`${baseSegment}${pathSegment}`, this.siteBase)
	}

	private snippet(text: string): string {
		return text.length > UNEXPECTED_BODY_SNIPPET_LENGTH ? `${text.slice(0, UNEXPECTED_BODY_SNIPPET_LENGTH)}…` : text
	}
}
