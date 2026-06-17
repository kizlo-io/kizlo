import type { UnionToIntersection } from "@kizlo/shared"
import type { EventHandler } from "../webhook"
import type { AnyProcedureRouter } from "./procedure"

export interface ExtensionInitOptions {
	context: { something: string }
}

export interface ExtensionInitResult<TRouter extends AnyProcedureRouter> {
	router?: TRouter
	events?: EventHandler[]
}

export interface Extension<TId extends string, TRouter extends AnyProcedureRouter> {
	id: TId
	init: ExtensionInitFn<TRouter>
}

export type AnyExtension = Extension<any, AnyProcedureRouter>

export type ExtensionInitFn<TRouter extends AnyProcedureRouter> = (context: ExtensionInitOptions) => ExtensionInitResult<TRouter>

export type ExtractExtensionRouter<TExt extends AnyExtension> =
	TExt extends Extension<infer Name, infer Router>
		? [keyof Router] extends [never]
			? never
			: string extends keyof Router
				? never
				: Record<Name, Router>
		: never

export type InferExtensionRouter<TExt extends readonly AnyExtension[]> = TExt extends readonly []
	? Record<never, never>
	: ExtractExtensionRouter<TExt[number]> extends infer R
		? [R] extends [never]
			? Record<never, never>
			: UnionToIntersection<R>
		: never

export function createExtension<TId extends string, TRouter extends AnyProcedureRouter = AnyProcedureRouter>(
	extension: Extension<TId, TRouter>,
) {
	return extension
}
