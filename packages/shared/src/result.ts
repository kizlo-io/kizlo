// ====================================================
// RESULT
// ====================================================

export type ErrorCodeLike = Uppercase<string>

export type InferError<R extends Result> = R extends ResultError<infer T> ? T : never
export type InferSuccess<R extends Result> = R extends ResultSuccess<infer T> ? T : never

export type ResultSuccess<T> = [null, T]
export type ResultError<E extends ErrorCodeLike = ErrorCodeLike> = [ResultErrorException<E>, null]

export type Result<T = unknown, E extends ErrorCodeLike = ErrorCodeLike> = ResultError<E> | ResultSuccess<T>

export class ResultErrorException<E extends string = string> extends Error {
	code: E

	constructor(error: { code: E; message: string; cause?: unknown } | E) {
		super(typeof error === "string" ? error : error.message)
		this.name = "ResultErrorException"

		if (typeof error === "string") {
			this.code = error
		} else {
			this.code = error.code
			this.message = error.message
			this.cause = error.cause
		}
	}
}

export const error = <E extends ErrorCodeLike>(error: { code: E; message: string } | E): ResultError<E> => [
	new ResultErrorException<E>(error),
	null,
]

export const success = <T>(data: T): ResultSuccess<T> => [null, data]

// ====================================================
// TRY CATCH
// ====================================================

export type TryCatchError<E = unknown> = [E, null]
export type TryCatchSuccess<T = unknown> = [null, T]

export type TryCatchResult<T = unknown, E = unknown> = TryCatchSuccess<T> | TryCatchError<E>

export const tryCatch = async <T, E = Error>(promise: Promise<T>): Promise<TryCatchResult<T, E>> => {
	try {
		const result = await promise
		return [null, result]
	} catch (err) {
		return [err as E, null]
	}
}

export const tryCatchSync = <T, E = Error>(fn: () => T): TryCatchResult<T, E> => {
	try {
		const result = fn()
		return [null, result]
	} catch (err) {
		return [err as E, null]
	}
}

export const isResult = <T = unknown, E extends ErrorCodeLike = ErrorCodeLike>(value: unknown): value is Result<T, E> => {
	if (!Array.isArray(value) || value.length !== 2) return false

	const [first, second] = value

	if (first instanceof ResultErrorException && second === null) return true
	if (first === null) return true

	return false
}
