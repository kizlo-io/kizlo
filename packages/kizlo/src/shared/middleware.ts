import type { UnionToIntersection } from "@kizlo/shared"
import type { ProcedureContext } from "../context"
import type { DefinedErrorMapLike } from "./error"
import type { BaseHandlerOptions } from "./procedure"
import type { AnyContext } from "./types"

export type InferMiddlewares<T extends readonly AnyMiddleware[] | undefined> = T extends readonly []
	? object
	: T extends readonly AnyMiddleware[]
		? UnionToIntersection<ExtractMiddlewareContextOutput<T[number]>>
		: object

export interface MiddlewareResult<TOutContext extends AnyContext, TOutput> {
	/** The handler's return value, as it flows back up through any middleware that awaited `next()`. */
	output: TOutput
	/** The context after this point in the chain, including anything middleware added via `next({ context })`. */
	context: TOutContext
}

export type MiddlewareNextFn<TOutput> = {
	(): Promise<MiddlewareResult<AnyContext, TOutput>>
	<UOutContext extends AnyContext>(options: {
		/** Values to merge into the context for every middleware and the handler downstream — added to it, fully typed. */
		context: UOutContext
	}): Promise<MiddlewareResult<UOutContext, TOutput>>
}

export type MiddlewareOptions<TInput, TOutput, TError extends DefinedErrorMapLike> = BaseHandlerOptions<
	TInput,
	ProcedureContext,
	TError
> & {
	/** Run the next middleware (or the handler) and return its result; pass `{ context }` to extend the context for everything downstream. */
	next: MiddlewareNextFn<TOutput>
}

export type MiddlewareHandler<TInput, TOutput, TError extends DefinedErrorMapLike, TOutContext extends AnyContext> = (
	options: MiddlewareOptions<TInput, TOutput, TError>,
) => Promise<MiddlewareResult<TOutContext, TOutput>>

export type Middleware<
	TInput,
	TOutput,
	TError extends DefinedErrorMapLike = DefinedErrorMapLike,
	TOutContext extends AnyContext = AnyContext,
> = MiddlewareHandler<TInput, TOutput, TError, TOutContext>

export type AnyMiddleware = Middleware<any, any, any, any>

export type ExtractMiddlewareContextOutput<M> = M extends Middleware<any, any, any, infer TOut> ? TOut : never

export function createMiddleware<
	TInput = any,
	TOutput = any,
	TError extends DefinedErrorMapLike = DefinedErrorMapLike,
	TOutContext extends AnyContext = AnyContext,
>(handler: MiddlewareHandler<TInput, TOutput, TError, TOutContext>): Middleware<TInput, TOutput, TError, TOutContext> {
	return handler
}
