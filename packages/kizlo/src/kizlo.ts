import type { IntegrationPluginRequirement } from "@kizlo/shared"
import { tryCatch } from "@kizlo/shared"
import { OpenAPIHandler } from "@orpc/openapi/fetch"
import { createRouterClient, ORPCError } from "@orpc/server"
import { RPCHandler } from "@orpc/server/fetch"
import { consoleLog, type LogLevel } from "./adapters/logger"
import { mergeServiceAdapters } from "./adapters/types"
import { Context, type ProcedureContext } from "./context"
import { CORE_PROCEDURES, type CoreProcedures } from "./procedures"
import { RPC_PROTOCOL_HEADER } from "./shared/constants"
import { isContractGeneration } from "./shared/contract-generation"
import { KizloError } from "./shared/error"
import {
	type AnyIntegration,
	assertIntegrationEndpoints,
	assertIntegrationEnv,
	type EnvReader,
	type InferIntegrationProcedures,
	readEnv,
} from "./shared/integration"
import type { InvocationScope } from "./shared/procedure"
import { createResultClient, type ResultClient } from "./shared/result"
import { createOrpcRouter } from "./shared/router"
import { isTypescriptObject } from "./shared/utils"
import { createWebhookRouter, type EventHandler } from "./webhook"
import type { WordPressCredentials } from "./wordpress"

export type AnyKizloConfig = KizloConfig<any>

export interface KizloConfig<TIntegrations extends readonly AnyIntegration[]> {
	baseUrl: string
	siteSecret: string
	integrations?: TIntegrations
	logging?: false | LogLevel
	credentials: WordPressCredentials
	wordpressEndpoints?: object
}

export type RootProcedures<TIntegrations extends readonly AnyIntegration[]> = InferIntegrationProcedures<TIntegrations> & CoreProcedures

export type S2SClient<TIntegrations extends readonly AnyIntegration[]> = ResultClient<RootProcedures<TIntegrations>>

export class Kizlo<TIntegrations extends readonly AnyIntegration[] = []> {
	public readonly context: Context
	public readonly client: S2SClient<TIntegrations>
	public readonly procedures: RootProcedures<TIntegrations>
	private readonly remoteHandler: RPCHandler<ProcedureContext>
	private readonly openapiHandler: OpenAPIHandler<ProcedureContext>
	private readonly config: KizloConfig<TIntegrations>

	constructor(config: KizloConfig<TIntegrations>) {
		this.config = config
		const integrations = this.registerIntegrations()

		this.context = new Context({
			adapters: integrations.adapters,
			siteSecret: config.siteSecret,
			credentials: config.credentials,
			wordpressEndpoints: config.wordpressEndpoints,
			integrationPlugins: integrations.plugins,
		})

		this.procedures = Object.assign(Object.assign({}, { ...integrations.procedures, ...CORE_PROCEDURES }), {
			webhooks: createWebhookRouter({
				events: integrations.events,
			}),
		})

		const orpcRouter = createOrpcRouter(this.procedures)
		this.client = createResultClient(createRouterClient(orpcRouter, { context: () => this.context.createServerContext() } as never))

		this.remoteHandler = new RPCHandler(orpcRouter, {
			filter: (options) => {
				return this.checkInvocationScope(options.contract["~orpc"].meta, "remote")
			},
			interceptors: [this.errorInterceptor()],
		})

		this.openapiHandler = new OpenAPIHandler(orpcRouter, {
			filter: (options) => {
				return this.checkInvocationScope(options.contract["~orpc"].meta, "api")
			},
			interceptors: [this.errorInterceptor()],
			customErrorResponseBodyEncoder(error) {
				const { defined, ...rest } = error.toJSON()
				return rest
			},
		})

		this.handler = this.handler.bind(this)
	}

	public async handler(request: Request): Promise<Response> {
		const serverUrl = new URL(this.config.baseUrl)
		const context = this.context.createRestContext(request)
		const isRpcRequest = request.headers.get(RPC_PROTOCOL_HEADER) !== null

		const result = !isRpcRequest
			? await this.openapiHandler.handle(request, { context, prefix: serverUrl.pathname as never })
			: await this.remoteHandler.handle(request, { context, prefix: serverUrl.pathname as never })

		if (!result.matched) return new Response("Not Found", { status: 404 })

		for (const [key, value] of context.headers.entries()) {
			if (key.toLowerCase() === "set-cookie") continue
			result.response.headers.set(key, value)
		}
		for (const cookie of context.headers.getSetCookie()) {
			result.response.headers.append("Set-Cookie", cookie)
		}

		return result.response
	}

	private errorInterceptor() {
		return async ({ context, next }: { context: ProcedureContext; next: () => Promise<any> }) => {
			const [err, data] = await tryCatch(next())

			if (err) {
				if (err instanceof KizloError) {
					throw new ORPCError(err.code, {
						status: err.status,
						message: err.message,
						data: err.data,
					})
				}

				context.logger.error("Request handler failed", err)

				throw err
			}

			return data
		}
	}

	private checkInvocationScope(value: unknown, scope: InvocationScope): boolean {
		return isTypescriptObject(value) && "scope" in value && value.scope === scope
	}

	private registerIntegrations() {
		const procedures: Record<string, any> = {}
		const events: EventHandler[] = []
		const plugins: IntegrationPluginRequirement[] = []
		let adapters = mergeServiceAdapters(
			this.config.logging ? { logger: consoleLog({ levels: levelsFrom(this.config.logging) }) } : undefined,
		)
		const reservedIds = new Set([...Object.keys(CORE_PROCEDURES), "webhooks"])
		const integrationIds = new Set<string>()

		// Contract generation imports this module for the procedure tree's exported shape alone, with no
		// generated tree to check against and no request that could reach a missing endpoint.
		const generating = isContractGeneration()

		for (const integration of this.config.integrations ?? []) {
			if (reservedIds.has(integration.id)) {
				throw new KizloError("INTEGRATION_ID_CONFLICT", {
					message: `The integration id "${integration.id}" is reserved by Kizlo. Choose a different integration id.`,
				})
			}
			if (integrationIds.has(integration.id)) {
				throw new KizloError("INTEGRATION_ID_CONFLICT", {
					message: `The integration id "${integration.id}" is registered more than once. Give every integration a unique id.`,
				})
			}
			integrationIds.add(integration.id)

			if (!generating) assertIntegrationEndpoints(integration, this.config.wordpressEndpoints ?? {})
			plugins.push(...(integration.requires?.plugins ?? []))
			if (integration.procedures && Object.keys(integration.procedures).length > 0) procedures[integration.id] = integration.procedures
			for (const handler of integration.events ?? []) events.push(handler)
			adapters = mergeServiceAdapters(adapters, integration.adapters)
		}

		return {
			adapters,
			events,
			plugins,
			procedures: procedures as InferIntegrationProcedures<TIntegrations>,
		}
	}
}

export interface CreateKizloOptions<TIntegrations extends readonly AnyIntegration[] = []> {
	/** Public base URL of your Kizlo server. Falls back to the `baseUrl` value contributed by an integration. */
	baseUrl?: string
	/** Secret shared with WordPress. Falls back to the `siteSecret` value contributed by an integration. */
	siteSecret?: string
	/** Integrations to compose, built with `createIntegration`. */
	integrations?: TIntegrations
	/** Enable Kizlo's built-in console logger at this level. */
	logging?: false | LogLevel
	/**
	 * The generated endpoints to run against WordPress, plus optional explicit credentials. Pass the
	 * `endpoints` export of your generated barrel. Missing credentials fall back to the `wordpressUrl`,
	 * `wordpressUsername`, and `wordpressPassword` values contributed by integrations.
	 */
	wordpress?: { endpoints?: object; credentials?: Partial<WordPressCredentials> }
}

const WORDPRESS_ENV_VALUES = new Set(["siteSecret", "wordpressUrl", "wordpressUsername", "wordpressPassword"])

/**
 * Compose environment sources without letting `undefined` erase an earlier value, then resolve
 * Kizlo's active WordPress connection from the canonical `mode` value.
 */
export function integrationEnv(integrations: readonly AnyIntegration[]): EnvReader {
	const composed: EnvReader = (name) => {
		let value: string | undefined
		for (const integration of integrations) {
			if (!integration.env) continue
			const contribution = readEnv(integration.env, name)
			if (contribution !== undefined) value = contribution
		}
		return value
	}

	const mode = composed("mode")?.trim()
	if (mode && mode !== "local" && mode !== "remote") {
		throw new KizloError("INVALID_ENV_VALUE", {
			message: `The "mode" environment value must be "local" or "remote", got "${mode}".`,
		})
	}
	const profile = mode === "local" ? "local" : "remote"

	return (name) => {
		return WORDPRESS_ENV_VALUES.has(name) ? composed(`${profile}.${name}`) : composed(name)
	}
}

function levelsFrom(level: LogLevel): LogLevel[] {
	const levels: LogLevel[] = ["debug", "info", "warn", "error"]
	return levels.slice(levels.indexOf(level))
}

function requireEnvValue(name: string, env: EnvReader): string {
	const value = env(name)?.trim()
	if (value) return value
	// Contract generation imports this module only for the procedure tree's exported shape, which no env
	// value affects. A placeholder lets the import complete; a real request never runs in this mode.
	if (isContractGeneration()) return ""
	throw new KizloError("MISSING_ENV_VALUE", {
		message: `Kizlo requires the "${name}" environment value. Provide it through an integration or an explicit createKizlo option.`,
	})
}

export function resolveWordPressConnection(
	options: Pick<CreateKizloOptions, "wordpress"> | undefined,
	env: EnvReader,
): { credentials: WordPressCredentials } {
	const credentials = options?.wordpress?.credentials
	return {
		credentials: {
			url: credentials?.url ?? requireEnvValue("wordpressUrl", env),
			username: credentials?.username ?? requireEnvValue("wordpressUsername", env),
			password: credentials?.password ?? requireEnvValue("wordpressPassword", env),
		},
	}
}

/**
 * Resolves a full `KizloConfig` from explicit options and the composed integration environment.
 */
export function resolveKizloConfig<TIntegrations extends readonly AnyIntegration[]>(
	options: CreateKizloOptions<TIntegrations> | undefined,
): KizloConfig<TIntegrations> {
	const integrations = options?.integrations ?? ([] as unknown as TIntegrations)
	const env = integrationEnv(integrations)
	if (!isContractGeneration()) {
		for (const integration of integrations) assertIntegrationEnv(integration, env)
	}
	const { credentials } = resolveWordPressConnection(options, env)
	return {
		baseUrl: options?.baseUrl ?? requireEnvValue("baseUrl", env),
		siteSecret: options?.siteSecret ?? requireEnvValue("siteSecret", env),
		integrations,
		logging: options?.logging,
		credentials,
		wordpressEndpoints: options?.wordpress?.endpoints,
	}
}

/**
 * Creates a Kizlo server from integration-contributed environment values, with explicit options
 * taking precedence.
 */
export function createKizlo<TIntegrations extends readonly AnyIntegration[] = []>(
	options?: CreateKizloOptions<TIntegrations>,
): Kizlo<TIntegrations> {
	return new Kizlo(resolveKizloConfig(options))
}
