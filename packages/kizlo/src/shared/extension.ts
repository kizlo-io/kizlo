import type { ExtensionPluginRequirement, UnionToIntersection } from "@kizlo/shared"
import type { EventHandler } from "../webhook"
import { KizloError } from "./error"
import type { AnyProcedureRouter } from "./procedure"

export interface ExtensionInitOptions {
	context: { something: string }
}

/**
 * What an extension needs from WordPress to work at all.
 *
 * An extension ships in two halves that update separately: this package, and the WordPress plugin that
 * serves the endpoints it calls. Neither half can see the other's version through npm, so an extension
 * says here what it is calling, and Kizlo checks it once at startup rather than letting the first
 * request fail somewhere inside a procedure.
 */
export interface ExtensionRequirements {
	/** The WordPress plugin serving this extension's endpoints, checked against what the site reports. */
	plugin?: ExtensionPluginRequirement
	/**
	 * Endpoint subtrees this extension calls, dotted from the root of the generated tree, e.g.
	 * `"woocommerce.store.cart"`. Naming the subtree rather than every leaf keeps this a statement about
	 * which contract has to be present, not a second copy of the call sites.
	 */
	endpoints?: string[]
}

export interface ExtensionInitResult<TRouter extends AnyProcedureRouter> {
	/** Procedures the extension exposes, grouped by name. Each entry (or nested group) becomes a client method under the extension's `id`. */
	router?: TRouter
	/** Webhook event handlers, built with `createEventHandler`, run when WordPress emits a matching event. */
	events?: EventHandler[]
}

export interface Extension<TId extends string, TRouter extends AnyProcedureRouter> {
	id: TId
	init: ExtensionInitFn<TRouter>
	/** What this extension needs from WordPress. Checked when the server is created. */
	requires?: ExtensionRequirements
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

/** The declared subtrees the generated tree does not have. */
export function missingEndpoints(endpoints: object, required: readonly string[]): string[] {
	return required.filter((path) => {
		let node: unknown = endpoints
		for (const key of path.split(".")) {
			if (node === null || typeof node !== "object" || !(key in node)) return true
			node = (node as Record<string, unknown>)[key]
		}
		return false
	})
}

/**
 * Fail at startup when an extension's endpoints are not in the generated tree, naming the plugin that
 * would have put them there.
 *
 * Absent endpoints mean the WordPress half is missing, too old to describe its routes, or the tree was
 * generated against a different WordPress. Left alone it surfaces as a property access on `undefined`
 * inside whichever procedure ran first, which says nothing about any of that.
 */
export function assertExtensionEndpoints(extension: AnyExtension, endpoints: object): void {
	const required = extension.requires?.endpoints
	if (!required?.length) return

	const missing = missingEndpoints(endpoints, required)
	if (missing.length === 0) return

	const plugin = extension.requires?.plugin
	const remedy = plugin
		? `Install or update the ${plugin.name} WordPress plugin (${plugin.version}+), then run \`kizlo generate\`.`
		: "Run `kizlo generate` against a WordPress that serves them."

	throw new KizloError("MISSING_WORDPRESS_ENDPOINTS", {
		message: `The "${extension.id}" extension needs WordPress endpoints your generated client does not have: ${missing.join(", ")}. ${remedy}`,
	})
}
