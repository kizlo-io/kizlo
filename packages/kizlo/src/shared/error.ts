import type { AnySchema, LiteralUnion, Metadata, SchemaInput, SchemaOutput } from "@kizlo/shared"

export const COMMON_ERRORS = {
	BAD_REQUEST: {
		status: 400,
		message: "Bad Request",
	},
	UNAUTHORIZED: {
		status: 401,
		message: "Unauthorized",
	},
	FORBIDDEN: {
		status: 403,
		message: "Forbidden",
	},
	NOT_FOUND: {
		status: 404,
		message: "Not Found",
	},
	METHOD_NOT_SUPPORTED: {
		status: 405,
		message: "Method Not Supported",
	},
	NOT_ACCEPTABLE: {
		status: 406,
		message: "Not Acceptable",
	},
	TIMEOUT: {
		status: 408,
		message: "Request Timeout",
	},
	CONFLICT: {
		status: 409,
		message: "Conflict",
	},
	PRECONDITION_FAILED: {
		status: 412,
		message: "Precondition Failed",
	},
	PAYLOAD_TOO_LARGE: {
		status: 413,
		message: "Payload Too Large",
	},
	UNSUPPORTED_MEDIA_TYPE: {
		status: 415,
		message: "Unsupported Media Type",
	},
	UNPROCESSABLE_CONTENT: {
		status: 422,
		message: "Unprocessable Content",
	},
	TOO_MANY_REQUESTS: {
		status: 429,
		message: "Too Many Requests",
	},
	CLIENT_CLOSED_REQUEST: {
		status: 499,
		message: "Client Closed Request",
	},
	INTERNAL_SERVER_ERROR: {
		status: 500,
		message: "Internal Server Error",
	},
	NOT_IMPLEMENTED: {
		status: 501,
		message: "Not Implemented",
	},
	BAD_GATEWAY: {
		status: 502,
		message: "Bad Gateway",
	},
	SERVICE_UNAVAILABLE: {
		status: 503,
		message: "Service Unavailable",
	},
	GATEWAY_TIMEOUT: {
		status: 504,
		message: "Gateway Timeout",
	},
	UNEXPECTED_ERROR: {
		status: 500,
		message: "An unexpected error occurred",
	},
} satisfies Record<string, ErrorDefinition>

export type CommonErrorMap = typeof COMMON_ERRORS
export type CommonErrorCode = keyof CommonErrorMap
export type CommonErrorLiteral = LiteralUnion<CommonErrorCode, string>

export type WithCommonErrorMap<TErrors extends DefinedErrorMapLike> = CommonErrorMap & {
	[K in keyof TErrors as string extends K ? never : K]: TErrors[K]
}

export interface KizloErrorOptions {
	/** Human-readable message. Defaults to the matching common error's preset message, or the code itself. */
	message?: string
	/** HTTP status to send. Defaults to the matching common error's status, or `500`. */
	status?: number
	/** Arbitrary payload carried on the error and surfaced to the client. */
	data?: unknown
	/** Underlying error that triggered this one; set as the native `Error` `cause`. */
	cause?: unknown
}

export class KizloError<TCode extends CommonErrorLiteral = CommonErrorLiteral, TData = unknown> extends Error {
	/** Always `"KizloError"` — the discriminator `isKizloError` checks. */
	readonly name = "KizloError"
	/** The error code, e.g. `"NOT_FOUND"` or a custom code from your error map. */
	readonly code: TCode
	/** The payload passed when the error was thrown, or `null`. */
	readonly data: TData
	/** The HTTP status this error maps to. */
	readonly status: number

	constructor(code: TCode, options?: KizloErrorOptions) {
		const preset = COMMON_ERRORS[code as never] as { status: number; message: string } | undefined

		const message = options?.message ?? preset?.message ?? String(code)
		super(message, options?.cause ? { cause: options.cause } : undefined)

		this.code = code
		this.status = options?.status ?? preset?.status ?? 500
		this.data = (options?.data ?? null) as TData
	}
}

export function isKizloError(value: unknown): value is KizloError {
	if (value instanceof KizloError) return true
	if (typeof value !== "object" || value === null) return false
	const v = value as Record<string, unknown>
	return v.name === "KizloError" && typeof v.code === "string" && typeof v.message === "string"
}

export function toKizloError(e: unknown): KizloError {
	if (isKizloError(e)) return e

	if (typeof e === "object" && e !== null && "code" in e && typeof e.code === "string") {
		const err = e as { code: string; message?: string; status?: number; data?: unknown }
		return new KizloError(err.code, { message: err.message, status: err.status, data: err.data })
	}

	const message = e instanceof Error ? e.message : String(e)
	return new KizloError("INTERNAL_SERVER_ERROR", { message, cause: e })
}

export type ErrorDefinition = {
	/** HTTP status sent when this error is thrown. Defaults to the matching common error's status, or 500. */
	status?: number
	/** Human-readable message. Overridable per throw via `errors.CODE({ message })`. */
	message?: string
	/** Standard Schema for the error's `data` payload — validated and typed when you throw `errors.CODE({ data })`. */
	data?: AnySchema
}

export function defineErrorMap<const T extends Partial<Record<CommonErrorLiteral, ErrorDefinition>>>(map: T) {
	return map
}

export type DefinedErrorMapLike = Record<string, ErrorDefinition>

export type ThrowableErrorFn<TCode extends string, T extends ErrorDefinition> = T["data"] extends AnySchema
	? undefined extends SchemaInput<T["data"]>
		? (options?: { status?: number; message?: string; data?: SchemaInput<T["data"]> }) => KizloError<TCode, SchemaOutput<T["data"]>>
		: (options: { status?: number; message?: string; data: SchemaInput<T["data"]> }) => KizloError<TCode, SchemaOutput<T["data"]>>
	: (options?: { status?: number; message?: string; data?: Metadata }) => KizloError<TCode, SchemaOutput<T["data"]>>

export type ThrowableErrorMap<T extends DefinedErrorMapLike> = {
	[K in Extract<keyof T, string>]: ThrowableErrorFn<K, T[K]>
}

export function createThrowableErrorMap<TError extends DefinedErrorMapLike>(errors: TError): ThrowableErrorMap<WithCommonErrorMap<TError>> {
	return new Proxy({} as ThrowableErrorMap<WithCommonErrorMap<TError>>, {
		get(_target, p) {
			if (typeof p === "symbol") return undefined
			const preset = { COMMON_ERRORS, ...errors }[p]

			return (options?: ErrorDefinition) => {
				let data = options?.data

				if (preset?.data) {
					const result = preset.data["~standard"].validate(options?.data)

					if (result instanceof Promise) {
						throw new TypeError(
							`Schema validation for error "${String(p)}" returned a Promise. Async validation is not supported here; use a synchronous schema.`,
						)
					}

					if (result.issues) throw new TypeError(JSON.stringify(result.issues, null, 2))

					data = result.value
				}

				return new KizloError(p, {
					status: options?.status ?? preset?.status,
					message: options?.message ?? preset?.message,
					data,
				})
			}
		},
	})
}
