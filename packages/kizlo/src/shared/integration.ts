import type { IntegrationPluginRequirement, UnionToIntersection } from "@kizlo/shared"
import type { ServiceAdapters } from "../adapters/types"
import type { EventHandler } from "../webhook"
import { KizloError } from "./error"
import type { AnyProcedureTree } from "./procedure"

/**
 * What an integration needs to work at all.
 *
 * An integration can ship in two halves that update separately: this package, and the WordPress plugin
 * that serves the endpoints it calls. Environment values and endpoints are checked when the server starts.
 * Plugin versions are checked from the headers WordPress returns.
 */
export interface IntegrationRequirements {
	/** WordPress plugins serving this integration's endpoints, checked against what the site reports. */
	plugins?: IntegrationPluginRequirement[]
	/** Resolved environment values this integration needs, checked after every integration's `env` contribution is composed. */
	env?: readonly string[]
	/**
	 * Endpoint subtrees this integration calls, dotted from the root of the generated tree, e.g.
	 * `"woocommerce.store.cart"`. Naming the subtree rather than every leaf keeps this a statement about
	 * which contract has to be present, not a second copy of the call sites.
	 */
	endpoints?: string[]
}

/** Reads a scalar environment value by name. */
export type EnvReader = (name: string) => string | undefined

/** A nested environment record. Leaf values are strings supplied by the owning runtime. */
export interface EnvRecord {
	readonly [name: string]: string | EnvRecord | undefined
}

/** One WordPress connection profile contributed by a runtime integration. */
export interface WordPressEnv extends EnvRecord {
	readonly siteSecret?: string
	readonly wordpressUrl?: string
	readonly wordpressUsername?: string
	readonly wordpressPassword?: string
}

/**
 * Runtime-neutral values Kizlo consumes. Runtime integrations map their environment system onto
 * these camel-case keys. The open string index also lets integrations contribute provider values.
 */
export interface KizloEnv extends EnvRecord {
	/** Public URL of the mounted Kizlo handler. */
	readonly baseUrl?: string
	/** WordPress profile to use. Defaults to `remote`. */
	readonly mode?: string
	/** Values used when `mode` is absent or `remote`. */
	readonly remote?: WordPressEnv
	/** Values used when `mode` is `local`. */
	readonly local?: WordPressEnv
}

/** Environment values an integration contributes, either as a typed record or a lazy reader. */
export type EnvSource = KizloEnv | EnvReader

/** Read one scalar value by dotted path from an environment record or reader. */
export function readEnv(source: EnvSource, name: string): string | undefined {
	if (typeof source === "function") return source(name)

	let value: string | EnvRecord | undefined = source
	for (const segment of name.split(".")) {
		if (!value || typeof value === "string") return undefined
		value = value[segment]
	}
	return typeof value === "string" ? value : undefined
}

/** Required environment values the composed source does not provide. */
export function missingEnv(source: EnvSource, required: readonly string[]): string[] {
	return required.filter((name) => !readEnv(source, name)?.trim())
}

export interface Integration<TId extends string, TProcedures extends AnyProcedureTree = Record<never, never>> {
	id: TId
	/** Procedures the integration exposes. Each entry or nested group becomes a client method under its `id`. */
	procedures?: TProcedures
	/** Webhook event handlers, built with `createEventHandler`, run when WordPress emits a matching event. */
	events?: EventHandler[]
	/** Auth, captcha, geo, logger, or cookies adapters the integration supplies. */
	adapters?: ServiceAdapters
	/** Runtime-neutral environment values the integration contributes. Later concrete values replace earlier ones. */
	env?: EnvSource
	/** Environment, endpoint, and WordPress plugin requirements checked at their documented lifecycle points. */
	requires?: IntegrationRequirements
}

export type AnyIntegration = Integration<any, AnyProcedureTree>

export type ExtractIntegrationProcedures<TIntegration extends AnyIntegration> =
	TIntegration extends Integration<infer Name, infer Procedures>
		? [keyof Procedures] extends [never]
			? never
			: string extends keyof Procedures
				? never
				: Record<Name, Procedures>
		: never

export type InferIntegrationProcedures<TIntegrations extends readonly AnyIntegration[]> = TIntegrations extends readonly []
	? Record<never, never>
	: ExtractIntegrationProcedures<TIntegrations[number]> extends infer R
		? [R] extends [never]
			? Record<never, never>
			: UnionToIntersection<R>
		: never

export function createIntegration<TId extends string, TProcedures extends AnyProcedureTree = Record<never, never>>(
	integration: Integration<TId, TProcedures>,
) {
	return integration
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
 * Fail at startup when an integration's endpoints are not in the generated tree, naming the plugins that
 * would have put them there.
 *
 * Absent endpoints mean the WordPress half is missing, too old to describe its routes, or the tree was
 * generated against a different WordPress. Left alone it surfaces as a property access on `undefined`
 * inside whichever procedure ran first, which says nothing about any of that.
 */
export function assertIntegrationEndpoints(integration: AnyIntegration, endpoints: object): void {
	const required = integration.requires?.endpoints
	if (!required?.length) return

	const missing = missingEndpoints(endpoints, required)
	if (missing.length === 0) return

	const plugins = integration.requires?.plugins
	const remedy = plugins?.length
		? `Install or update the required WordPress plugins (${plugins.map((plugin) => `${plugin.name} ${plugin.version}+`).join(", ")}), then run \`kizlo generate\`.`
		: "Run `kizlo generate` against a WordPress that serves them."

	throw new KizloError("MISSING_WORDPRESS_ENDPOINTS", {
		message: `The "${integration.id}" integration needs WordPress endpoints your generated client does not have: ${missing.join(", ")}. ${remedy}`,
	})
}

/** Fail at startup when an integration's required environment values are absent. */
export function assertIntegrationEnv(integration: AnyIntegration, env: EnvSource): void {
	const required = integration.requires?.env
	if (!required?.length) return

	const missing = missingEnv(env, required)
	if (missing.length === 0) return

	throw new KizloError("MISSING_ENV_VALUE", {
		message: `The "${integration.id}" integration requires environment values that are missing: ${missing.join(", ")}.`,
	})
}
