import type { AnySchema, DeepMerge, Pathname, Prettify, Promisify, Schema, SchemaInput, SchemaIssue, SchemaOutput } from "@kizlo/shared"
import type { JsonifiedValue } from "@orpc/openapi-client"
import { type HTTPMethod, os } from "@orpc/server"
import type { ServerContext } from "../context"
import {
	COMMON_ERRORS,
	createThrowableErrorMap,
	type DefinedErrorMapLike,
	isKizloError,
	KizloError,
	type ThrowableErrorMap,
	type WithCommonErrorMap,
} from "./error"
import type { AnyMiddleware, InferUses, Middleware } from "./middleware"

// ====================================================
// SHARED
// ====================================================

export type AnyProcedureRouter = { [K: string]: AnyProcedure | AnyProcedureRouter }

export type RouterDepthTuple = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

export type ExtractProcedureByScope<
	TRouter extends AnyProcedureRouter,
	TScope extends InvocationScope,
	TDepth extends number = 10,
> = TDepth extends 0
	? TRouter
	: {
			[K in keyof TRouter as TRouter[K] extends Procedure<infer Scope, infer _Input, infer _Output, infer _Errors>
				? Scope extends TScope
					? K
					: never
				: TRouter[K] extends AnyProcedureRouter
					? keyof ExtractProcedureByScope<TRouter[K], TScope, RouterDepthTuple[TDepth]> extends never
						? never
						: K
					: never]: TRouter[K] extends AnyProcedure
				? TRouter[K]
				: TRouter[K] extends AnyProcedureRouter
					? ExtractProcedureByScope<TRouter[K], TScope, RouterDepthTuple[TDepth]>
					: never
		}

/** The base options passed to every procedure handler and middleware. */
export interface BaseHandlerOptions<TInput, TContext, TError extends DefinedErrorMapLike> {
	/** The validated, typed request. For `api`, the merged `{ params, query, body, headers }`; for `remote`/`internal`, the `input` schema's type. */
	input: TInput
	/** Server-side services and adapters — the WordPress client, logger, cookies, auth, and more — plus anything middleware adds. */
	context: TContext
	/** Typed error map — throw `errors.SOME_CODE()` for a known failure. */
	errors: ProcedureErrors<TError>
}

// ====================================================
// PROCEDURE
// ====================================================

export type InvocationScope = "internal" | "remote" | "api"

/** Callable map of a procedure's declared error codes plus the built-in common HTTP errors. */
export type ProcedureErrors<TError extends DefinedErrorMapLike = DefinedErrorMapLike> = ThrowableErrorMap<WithCommonErrorMap<TError>>

export type ProcedureHandler<TInput, TOutput, TError extends DefinedErrorMapLike, TContext extends ServerContext> = (
	options: BaseHandlerOptions<TInput, TContext, TError>,
) => Promisify<TOutput>

export interface Procedure<TScope extends InvocationScope, TInput, TOutput, TError extends DefinedErrorMapLike = DefinedErrorMapLike> {
	"~kizlo": {
		uses: AnyMiddleware[]
		handler: ProcedureHandler<TInput, TOutput, TError, ServerContext>
		options: {
			scope: TScope
			errors?: TError
			output: AnySchema
			inputValidation?: boolean
			outputValidation?: boolean
			middlewares?: AnyMiddleware[]
		} & (
			| { scope: "internal"; input?: AnySchema }
			| { scope: "remote"; input?: AnySchema; method?: HTTPMethod }
			| { scope: "api"; method?: HTTPMethod; path?: Pathname; body?: AnySchema; query?: AnySchema; params?: AnySchema; headers?: AnySchema }
		)
	}
}

export type AnyProcedure = Procedure<InvocationScope, any, any, any>

export type ProcedureContext<TMiddlewares extends AnyMiddleware[]> = ServerContext & InferUses<TMiddlewares>

export type SchemaIO<TSchema, TMap extends "output" | "input"> = TMap extends "output" ? SchemaOutput<TSchema> : SchemaInput<TSchema>

export type OpenapiPart<TKey extends string, TSchema, TMap extends "output" | "input"> = [TSchema] extends [never]
	? unknown
	: [TSchema] extends [Schema]
		? undefined extends SchemaIO<TSchema, TMap>
			? { [K in TKey]?: SchemaIO<TSchema, TMap> }
			: { [K in TKey]: SchemaIO<TSchema, TMap> }
		: unknown

export type ExtractParams<T extends string> = T extends `${string}{${infer Param}}${infer Rest}`
	? { [K in Param | keyof ExtractParams<Rest>]: string }
	: object

export type ResolveParamsPart<TPathname, TParams, TMap extends "output" | "input"> = [TPathname] extends [never]
	? OpenapiPart<"params", TParams, TMap>
	: TPathname extends string
		? ExtractParams<TPathname> extends infer TPath extends object
			? keyof TPath extends never
				? OpenapiPart<"params", TParams, TMap>
				: [TParams] extends [never]
					? { params: TPath }
					: [TParams] extends [Schema]
						? {
								params: DeepMerge<TPath, TMap extends "output" ? SchemaOutput<TParams> : SchemaInput<TParams>>
							}
						: { params: TPath }
			: OpenapiPart<"params", TParams, TMap>
		: OpenapiPart<"params", TParams, TMap>

type ResolveOpenapi<TPathname, TBody, TParams, TQuery, THeaders, TMap extends "output" | "input"> = OpenapiPart<"body", TBody, TMap> &
	ResolveParamsPart<TPathname, TParams, TMap> &
	OpenapiPart<"query", TQuery, TMap> &
	OpenapiPart<"headers", THeaders, TMap>

export type ResolvedSchemaOutput<TScope, TPathname, TInput, TBody, TParams, TQuery, THeaders> = Prettify<
	TScope extends "api"
		? ResolveOpenapi<TPathname, TBody, TParams, TQuery, THeaders, "output">
		: [TInput] extends [Schema]
			? SchemaOutput<TInput>
			: unknown
>

export type ResolvedSchemaInput<TScope, TPathname, TInput, TBody, TParams, TQuery, THeaders> = Prettify<
	TScope extends "api"
		? ResolveOpenapi<TPathname, TBody, TParams, TQuery, THeaders, "input">
		: [TInput] extends [Schema]
			? SchemaInput<TInput>
			: unknown
>

export type ProcedureOptions<
	TScope extends InvocationScope,
	TPathname extends Pathname,
	TInput extends Schema | undefined,
	TBody extends Schema | undefined,
	TParams extends Schema | undefined,
	TQuery extends Schema | undefined,
	THeaders extends Schema | undefined,
	TOutput extends Schema,
	TError extends DefinedErrorMapLike,
	TMiddlewares extends Middleware<
		ResolvedSchemaOutput<TScope, TPathname, TInput, TBody, TParams, TQuery, THeaders>,
		SchemaOutput<TOutput>,
		TError
	>[],
> = {
	/** Where the procedure can be called from: `"api"` (HTTP REST endpoint), `"remote"` (RPC-style endpoint), or `"internal"` (server-only). */
	scope: TScope
	/** Error codes this procedure can throw, on top of the built-in common HTTP errors. An inline object or a `defineErrorMap`. */
	errors?: TError
	/** Schema that types — and, when `outputValidation` is on, validates — the handler's return value. */
	output: TOutput
	/** Middleware to run before the handler, in declaration order. */
	middlewares?: TMiddlewares
	/**
	 * Validate the incoming request against the input schemas.
	 * @default true
	 */
	inputValidation?: boolean
	/**
	 * Validate the return value against `output`.
	 * @default false
	 */
	outputValidation?: boolean
} & (TScope extends "api"
	? {
			/** HTTP method for the route, e.g. `"GET"` or `"POST"`. */
			method?: HTTPMethod
			/** REST path with `{param}` placeholders, e.g. `/featured/{id}`. */
			path?: TPathname
			/** Schema for the request body. */
			body?: TBody
			/** Schema for the query string. */
			query?: TQuery
			/** Schema for the path parameters. */
			params?: TParams
			/** Schema for the request headers. */
			headers?: THeaders
		}
	: TScope extends "remote"
		? {
				/** Schema for the call's single input argument. */
				input?: TInput
				/** HTTP method for the underlying request. */
				method?: HTTPMethod
			}
		: {
				/** Schema for the call's single input argument. */
				input?: TInput
			})

export function createProcedure<
	TScope extends InvocationScope,
	TPathname extends Pathname,
	TInput extends Schema | undefined = undefined,
	TBody extends Schema | undefined = undefined,
	TParams extends Schema | undefined = undefined,
	TQuery extends Schema | undefined = undefined,
	THeaders extends Schema | undefined = undefined,
	TOutput extends Schema = Schema,
	TError extends DefinedErrorMapLike = DefinedErrorMapLike,
	TMiddlewares extends Middleware<
		ResolvedSchemaOutput<TScope, TPathname, TInput, TBody, TParams, TQuery, THeaders>,
		SchemaOutput<TOutput>,
		TError
	>[] = Middleware<ResolvedSchemaOutput<TScope, TPathname, TInput, TBody, TParams, TQuery, THeaders>, SchemaOutput<TOutput>, TError>[],
	TContext extends ProcedureContext<TMiddlewares> = ProcedureContext<TMiddlewares>,
>(
	options: ProcedureOptions<TScope, TPathname, TInput, TBody, TParams, TQuery, THeaders, TOutput, TError, TMiddlewares>,
	handler: ProcedureHandler<
		ResolvedSchemaOutput<TScope, TPathname, TInput, TBody, TParams, TQuery, THeaders>,
		SchemaOutput<TOutput>,
		TError,
		TContext
	>,
): Procedure<
	TScope,
	ResolvedSchemaInput<TScope, TPathname, TInput, TBody, TParams, TQuery, THeaders>,
	TScope extends "api" ? JsonifiedValue<SchemaOutput<TOutput>> : SchemaOutput<TOutput>,
	TError
> {
	return {
		"~kizlo": {
			options: options as never,
			uses: options.middlewares ?? [],
			handler: (ctx) => handler(ctx as any) as never,
		},
	}
}

export function schemaType<TInput, TOutput = TInput>(schema?: AnySchema): Schema<TInput, TOutput> {
	return (
		schema ?? {
			"~standard": {
				vendor: "custom",
				version: 1,
				async validate(value) {
					return { value: value as TOutput }
				},
			},
		}
	)
}

export function buildProcedure(procedure: AnyProcedure) {
	const { handler, options, uses } = procedure["~kizlo"]

	const errors = createThrowableErrorMap(options.errors ?? {})

	const builder = os.$context().$config({
		initialInputValidationIndex: (options.inputValidation ?? true) ? undefined : Number.NaN,
		initialOutputValidationIndex: (options.outputValidation ?? false) ? undefined : Number.NaN,
	})

	let chain = builder.meta({ scope: options.scope })

	for (const middleware of uses) {
		chain = chain.use(
			builder.middleware(async ({ next, context }, input) => {
				try {
					return await middleware({ input, next: next as any, context: context as any, errors })
				} catch (error) {
					handleUnexpectedError(error, options.errors)
				}
			}),
		)
	}

	switch (options.scope) {
		case "internal": {
			if (options.input) chain = chain.input(options.input) as any
			break
		}

		case "remote": {
			chain = chain.route({ method: options.method }) as any
			if (options.input) chain = chain.input(options.input) as any
			break
		}

		case "api": {
			chain = chain.route({
				path: options.path,
				method: options.method,
				inputStructure: "detailed",
			})

			const shape: Record<string, AnySchema> = {}
			if (options.params) shape.params = options.params
			if (options.query) shape.query = options.query
			if (options.headers) shape.headers = options.headers
			if (options.body) shape.body = options.body

			if (Object.keys(shape).length > 0) {
				chain = chain.input(combineDetailed(shape)) as any
			}

			break
		}
	}

	if (options.output) chain = chain.output(options.output) as any

	return chain.handler(async ({ context, input }: { context: any; input: any }) => {
		try {
			return await handler({ context, input, errors })
		} catch (error) {
			handleUnexpectedError(error, options.errors)
		}
	})
}

export function handleUnexpectedError(error: unknown, errors?: DefinedErrorMapLike): never {
	const definedErrorMap = { ...COMMON_ERRORS, ...errors }

	if (isKizloError(error)) {
		const defined = definedErrorMap[error.code as never]
		if (!defined) throw new KizloError("UNEXPECTED_ERROR", { cause: error })
	}

	throw error
}

export function combineDetailed(parts: Record<string, AnySchema>): AnySchema {
	return {
		"~standard": {
			version: 1,
			vendor: "kizlo",
			validate: async (value: unknown) => {
				if (value != null && typeof value !== "object") {
					return { issues: [{ message: "Expected object" }] }
				}
				const input = (value ?? {}) as Record<string, unknown>
				const result: Record<string, unknown> = {}
				const issues: SchemaIssue[] = []

				for (const [key, schema] of Object.entries(parts)) {
					let r = schema["~standard"].validate(input[key])
					if (r instanceof Promise) r = await r
					if (r.issues) {
						for (const issue of r.issues) {
							issues.push({ ...issue, path: [key, ...(issue.path ?? [])] })
						}
					} else {
						result[key] = r.value
					}
				}

				return issues.length ? { issues } : { value: result }
			},
		},
	} satisfies AnySchema
}
