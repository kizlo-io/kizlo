import { tryCatch } from "@kizlo/shared"
import { OpenAPIHandler } from "@orpc/openapi/fetch"
import { createRouterClient, ORPCError } from "@orpc/server"
import { RPCHandler } from "@orpc/server/fetch"
import type { AuthAdapter } from "./adapters/auth"
import type { CaptchaAdapter } from "./adapters/captcha"
import type { GeoAdapter } from "./adapters/geo"
import type { Environment, LoggerAdapter } from "./adapters/logger"
import { Context, type ServerContext } from "./context"
import { ROUTER_MAP, type RouterMap } from "./router"
import { RPC_PROTOCOL_HEADER } from "./shared/constants"
import { KizloError } from "./shared/error"
import type { AnyExtension, InferExtensionRouter } from "./shared/extension"
import type { InvocationScope } from "./shared/procedure"
import { createResultClient, type ResultClient } from "./shared/result"
import { createOrpcRouter } from "./shared/router"
import type { CookiesAdapter } from "./shared/types"
import { isTypescriptObject } from "./shared/utils"
import { createWebhookRouter, type EventHandler } from "./webhook"
import type { WordPressCredentials } from "./wordpress"

export type AnyKizloConfig = KizloConfig<any>

/**
 * Which credential set to read from the environment. Independent of `environment`
 * (which carries logging semantics off `NODE_ENV`): `"dev"` reads the `KIZLO_DEV_WORDPRESS_*`
 * / `KIZLO_DEV_SITE_SECRET` keys the local stack manages, `"production"` reads `KIZLO_WORDPRESS_*` / `KIZLO_SITE_SECRET`.
 */
export type KizloTarget = "dev" | "production"

export interface KizloConfig<TExts extends readonly AnyExtension[]> {
	baseUrl: string
	siteSecret: string
	extensions?: TExts
	environment: Environment
	target: KizloTarget
	adapters?: ServiceAdapters
	credentials: WordPressCredentials
}

export interface ServiceAdapters {
	geo?: GeoAdapter
	auth?: AuthAdapter
	logger?: LoggerAdapter
	captcha?: CaptchaAdapter
	cookies?: CookiesAdapter
}

export type RootRouter<TExts extends readonly AnyExtension[]> = InferExtensionRouter<TExts> & RouterMap

export type S2SClient<TExts extends readonly AnyExtension[]> = ResultClient<RootRouter<TExts>>

export class Kizlo<TExts extends readonly AnyExtension[] = []> {
	public readonly context: Context
	public readonly client: S2SClient<TExts>
	public readonly router: RootRouter<TExts>
	private readonly remoteHandler: RPCHandler<ServerContext>
	private readonly openapiHandler: OpenAPIHandler<ServerContext>
	private readonly config: KizloConfig<TExts>

	constructor(config: KizloConfig<TExts>) {
		this.config = config
		const extensions = this.registerExtensions()

		this.context = new Context({
			adapters: config.adapters,
			siteSecret: config.siteSecret,
			credentials: config.credentials,
		})

		this.router = Object.assign(Object.assign({}, { ...extensions.router, ...ROUTER_MAP }), {
			webhooks: createWebhookRouter({
				events: extensions.events,
			}),
		})

		const orpcRouter = createOrpcRouter(this.router)
		this.client = createResultClient(createRouterClient(orpcRouter, { context: this.context } as never))

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
			if (key.toLowerCase() === "set-cookie") {
				const cookies = context.headers.getSetCookie()
				cookies.forEach((cookie) => {
					result.response.headers.append("Set-Cookie", cookie)
				})
			} else {
				result.response.headers.set(key, value)
			}
		}

		return result.response
	}

	private errorInterceptor() {
		return async ({ next }: { next: () => Promise<any> }) => {
			const [err, data] = await tryCatch(next())

			if (err) {
				if (err instanceof KizloError) {
					throw new ORPCError(err.code, {
						status: err.status,
						message: err.message,
						data: err.data,
					})
				}

				console.log(err)

				throw err
			}

			return data
		}
	}

	private checkInvocationScope(value: unknown, scope: InvocationScope): boolean {
		return isTypescriptObject(value) && "scope" in value && value.scope === scope
	}

	private registerExtensions() {
		const router: Record<string, any> = {}
		const events: EventHandler[] = []

		for (const extension of this.config.extensions ?? []) {
			const data = extension.init({ context: { something: "" } })
			if (data.router) router[extension.id] = data.router
			for (const handler of data.events ?? []) events.push(handler)
		}

		return {
			events,
			router: router as InferExtensionRouter<TExts>,
		}
	}
}

export interface CreateKizloOptions<TExts extends readonly AnyExtension[] = []> {
	/** Public base URL of your Kizlo server, used to route requests. Falls back to the `KIZLO_BACKEND_URL` env var. */
	baseUrl?: string
	/** Secret shared with the WordPress plugin to sign and verify webhooks. Falls back to the `KIZLO_SITE_SECRET` env var (target-selected). */
	siteSecret?: string
	/** Extensions to register, built with `createExtension` — mounts their namespaces on the client and their routes and event handlers on the handler. */
	extensions?: TExts
	/** Runtime environment. Falls back to `NODE_ENV`, then `"development"`. */
	environment?: Environment
	/**
	 * Which credential set to use. Falls back to the `KIZLO_TARGET` env var, then `"production"`.
	 * Independent of `environment`: `"dev"` reads `KIZLO_DEV_WORDPRESS_*` / `KIZLO_DEV_SITE_SECRET` (the keys the
	 * local dev stack manages), `"production"` reads `KIZLO_WORDPRESS_*` / `KIZLO_SITE_SECRET`.
	 */
	target?: KizloTarget
	/** Service adapters: auth, captcha, geo, logger, and cookies. */
	adapters?: ServiceAdapters
	/**
	 * WordPress connection. Each credential falls back to a target-selected env var: with the default
	 * `"production"` target to `KIZLO_WORDPRESS_URL` / `KIZLO_WORDPRESS_USERNAME` / `KIZLO_WORDPRESS_APPLICATION_PASSWORD`,
	 * and with the `"dev"` target to their `KIZLO_DEV_WORDPRESS_*` counterparts.
	 */
	wordpress?: { credentials?: Partial<WordPressCredentials> }
}

function requireEnv(name: string): string {
	const value = process.env[name]?.trim()
	if (!value) throw new KizloError("MISSING_ENV_VARIABLE", { message: `Please define ${name} in your .env file.` })
	return value
}

function resolveTarget(option?: KizloTarget): KizloTarget {
	return option ?? (process.env.KIZLO_TARGET === "dev" ? "dev" : "production")
}

/** Env var names for a credential set: `KIZLO_DEV_WORDPRESS_URL` / `KIZLO_DEV_SITE_SECRET` for dev, `KIZLO_WORDPRESS_URL` / `KIZLO_SITE_SECRET` for production. */
function targetEnvKeys(target: KizloTarget) {
	const prefix = target === "dev" ? "KIZLO_DEV_" : "KIZLO_"
	return {
		siteSecret: `${prefix}SITE_SECRET`,
		url: `${prefix}WORDPRESS_URL`,
		username: `${prefix}WORDPRESS_USERNAME`,
		password: `${prefix}WORDPRESS_APPLICATION_PASSWORD`,
	}
}

/**
 * Resolves a full `KizloConfig` from options and the environment. Shared by the
 * base `createKizlo` and each framework factory — the single place env values
 * and credentials are read. `baseUrlEnvKey` is the only framework-varying part.
 */
export function resolveKizloConfig<TExts extends readonly AnyExtension[]>(
	options: CreateKizloOptions<TExts> | undefined,
	defaults: { baseUrlEnvKey: string; adapters?: ServiceAdapters },
): KizloConfig<TExts> {
	const credentials = options?.wordpress?.credentials
	const target = resolveTarget(options?.target)
	const keys = targetEnvKeys(target)
	return {
		baseUrl: options?.baseUrl ?? requireEnv(defaults.baseUrlEnvKey),
		siteSecret: options?.siteSecret ?? requireEnv(keys.siteSecret),
		environment: options?.environment ?? (process.env.NODE_ENV as Environment) ?? "development",
		target,
		extensions: options?.extensions,
		adapters: { ...defaults.adapters, ...options?.adapters },
		credentials: {
			url: credentials?.url ?? requireEnv(keys.url),
			username: credentials?.username ?? requireEnv(keys.username),
			password: credentials?.password ?? requireEnv(keys.password),
		},
	}
}

/**
 * Creates a Kizlo server from the environment (`KIZLO_BACKEND_URL`, `KIZLO_SITE_SECRET`,
 * `KIZLO_WORDPRESS_*`), with options taking precedence. Framework packages wrap this
 * with their own URL convention and adapters.
 */
export function createKizlo<TExts extends readonly AnyExtension[] = []>(options?: CreateKizloOptions<TExts>): Kizlo<TExts> {
	return new Kizlo(resolveKizloConfig(options, { baseUrlEnvKey: "KIZLO_BACKEND_URL" }))
}
