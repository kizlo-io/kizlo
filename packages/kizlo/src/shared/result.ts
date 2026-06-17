import type { SchemaOutput } from "@kizlo/shared"
import type { NestedClient } from "@orpc/client"
import { type DefinedErrorMapLike, type KizloError, toKizloError, type WithCommonErrorMap } from "./error"
import type { AnyProcedureRouter, Procedure } from "./procedure"

export type MaybeCallerOptions<UInput> = unknown extends UInput
	? []
	: [UInput] extends [undefined]
		? []
		: object extends UInput
			? [input?: UInput]
			: [input: UInput]

export type ProcedureMethod<UInput, UOutput, TError extends DefinedErrorMapLike> = {
	(...rest: MaybeCallerOptions<UInput>): Promise<KizloResult<UOutput, TError>>
	call: (...rest: MaybeCallerOptions<UInput>) => Promise<UOutput>
}

export type KizloErrorUnion<TErrors extends DefinedErrorMapLike> = {
	[K in Extract<keyof TErrors, string>]: KizloError<K, SchemaOutput<TErrors[K]["data"]>>
}[Extract<keyof TErrors, string>]

export type KizloResult<TOutput, TErrors extends DefinedErrorMapLike = DefinedErrorMapLike> =
	| { data: TOutput; error: null; success: true }
	| {
			data: undefined
			error: KizloErrorUnion<WithCommonErrorMap<TErrors>>
			success: false
	  }

export type ResultClient<T extends AnyProcedureRouter> = {
	[K in keyof T]: T[K] extends Procedure<infer _Scope, infer Input, infer Output, infer Errors>
		? ProcedureMethod<Input, Output, Errors>
		: T[K] extends AnyProcedureRouter
			? ResultClient<T[K]>
			: never
}

export function createResultClient<T extends AnyProcedureRouter>(client: NestedClient<any>): ResultClient<T> {
	const cache = new Map<string | symbol, unknown>()

	const proxy = new Proxy(typeof client === "function" ? client : () => {}, {
		async apply(_, __, args) {
			if (typeof client !== "function") {
				throw new Error("This client node is not callable")
			}

			try {
				const data = await (client as any)(...args)
				return { data, error: null, success: true }
			} catch (e) {
				return { data: undefined, error: toKizloError(e) as never, success: false }
			}
		},
		get(_, prop, receiver) {
			if (cache.has(prop)) return cache.get(prop)

			if (prop === "call" && typeof client === "function") {
				const unsafe = async (...args: any[]) => {
					try {
						return await (client as any)(...args)
					} catch (e) {
						throw toKizloError(e)
					}
				}
				cache.set(prop, unsafe)
				return unsafe
			}

			const value = Reflect.get(client, prop, receiver)

			if (typeof prop !== "string" || !isRecordLike(value)) {
				return value
			}

			const wrapped = createResultClient(value as NestedClient<any>)
			cache.set(prop, wrapped)
			return wrapped
		},
	})

	return proxy as unknown as ResultClient<T>
}

function isRecordLike(value: unknown): value is object & Record<PropertyKey, unknown> {
	return !!value && (typeof value === "object" || typeof value === "function")
}
