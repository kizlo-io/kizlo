import type { UnionToIntersection } from "@kizlo/shared"
import type { ServerContext } from "../context"
import type { DefinedErrorMapLike, ThrowableErrorMap } from "./error"
import type { AnyContext } from "./types"

export interface MiddlewareResult<TOutContext extends AnyContext, TOutput> {
	output: TOutput
	context: TOutContext
}

export type MiddlewareNextFn<TOutput> = {
	(): Promise<MiddlewareResult<AnyContext, TOutput>>
	<UOutContext extends AnyContext>(options: { context: UOutContext }): Promise<MiddlewareResult<UOutContext, TOutput>>
}

export type MiddlewareOptions<TInput, TOutput, TError extends DefinedErrorMapLike> = {
	input: TInput
	context: ServerContext
	next: MiddlewareNextFn<TOutput>
	errors: ThrowableErrorMap<TError>
}

export type MiddlewareHandler<TOutContext extends AnyContext, TInput, TOutput, TError extends DefinedErrorMapLike> = (
	options: MiddlewareOptions<TInput, TOutput, TError>,
) => Promise<MiddlewareResult<TOutContext, TOutput>>

export type Middleware<TOutContext extends AnyContext, TInput, TOutput, TError extends DefinedErrorMapLike> = MiddlewareHandler<
	TOutContext,
	TInput,
	TOutput,
	TError
>

export type AnyMiddleware = Middleware<any, any, any, any>

export type ExtractMiddlewareContextOutput<M> = M extends Middleware<infer TOut, any, any, any> ? TOut : never

export type InferUses<T extends readonly AnyMiddleware[] | undefined> = T extends readonly []
	? object
	: T extends readonly AnyMiddleware[]
		? UnionToIntersection<ExtractMiddlewareContextOutput<T[number]>>
		: object

export function createMiddleware<
	TOutContext extends AnyContext = AnyContext,
	TInput = any,
	TOutput = any,
	TError extends DefinedErrorMapLike = DefinedErrorMapLike,
>(handler: MiddlewareHandler<TOutContext, TInput, TOutput, TError>): Middleware<TOutContext, TInput, TOutput, TError> {
	return handler
}
