import { base64Decode, type Cookie, type CookieOptions, tryCatchSync } from "@kizlo/shared"
import { serialize } from "cookie"
import type { AuthUser } from "./adapters/auth"
import type { ConnInfo } from "./adapters/geo"
import { type Logger, type LogLevel, noopAdapter } from "./adapters/logger"
import { CookiesStorage } from "./cookie"
import { EmailService } from "./email/service"
import type { ServiceAdapters } from "./kizlo"
import { SettingsService } from "./settings/service"
import { compare, hmac } from "./shared/crypto"
import { PreviewTokenData, type PreviewTokenPayload } from "./shared/schema"
import type { WordPressCredentials } from "./wordpress"
import { WordPressService } from "./wordpress"

export interface ContextConfig {
	siteSecret: string
	adapters?: ServiceAdapters
	credentials: WordPressCredentials
}

export type AuthUserFn = () => Promise<AuthUser | null>
export type ConnInfoFn = () => Promise<ConnInfo | null>
export type VerifyCaptchaFn = (token: string) => Promise<boolean>
export type VerifyPreviewTokenFn = (token: string) => Promise<PreviewTokenPayload | null>

/**
 * The context every procedure, middleware, event, and webhook handler receives — the fixed base
 * the server builds. A procedure's handler receives this base plus whatever its middleware injected
 * via `next({ context })`.
 */
export interface ProcedureContext {
	/** The incoming HTTP `Request`, or `null` for server-side (non-HTTP) invocations. */
	request: Request | null
	/** Response headers to be sent (e.g. `Set-Cookie`), or `null` server-side. */
	headers: Headers | null
	/** The configured logger adapter. */
	logger: Logger
	/** Typed WordPress REST client. */
	wordpress: WordPressService
	/** Kizlo settings client. */
	settings: SettingsService
	/** Transactional email client. */
	email: EmailService
	/** The resolved context config: site secret, adapters, and WordPress credentials. */
	config: ContextConfig
	/** Resolve the caller's connection info (IP, geo) via the geo adapter, or `null`. */
	getConnInfo: ConnInfoFn
	/** Resolve the authenticated user via the auth adapter, or `null`. */
	getAuthUser: AuthUserFn
	/** Read and write cookies through the cookies adapter. */
	cookies: CookiesStorage
	/** Verify a CAPTCHA token via the captcha adapter. */
	verifyCaptcha: VerifyCaptchaFn
	/** Verify a preview token and return its payload, or `null`. */
	verifyPreviewToken: VerifyPreviewTokenFn
	/** How the procedure was called: `"client"` (over HTTP) or `"server"` (direct server invocation). */
	invokedBy: "client" | "server"
}

export class Context {
	private readonly config: ContextConfig
	private readonly logger: Logger
	private readonly wordpress: WordPressService
	private readonly settings: SettingsService
	private readonly email: EmailService

	constructor(config: ContextConfig) {
		this.config = config
		this.wordpress = new WordPressService(config)
		this.settings = new SettingsService(this.wordpress)
		this.email = new EmailService(this.wordpress)
		this.logger = this.createLogger()
	}

	public createRestContext(request: Request) {
		const headers = new Headers()

		return {
			headers,
			request: request.clone(),
			config: this.config,
			logger: this.logger,
			wordpress: this.wordpress,
			settings: this.settings,
			email: this.email,
			getConnInfo: this.createConnInfoFn(request),
			verifyCaptcha: this.createVerifyCaptchaFn(request),
			getAuthUser: this.createGetUserFn(request),
			verifyPreviewToken: this.createVerifyPreviewTokenFn(),
			cookies: this.createRestCookieStorage(request, headers),
			invokedBy: "client",
		} satisfies ProcedureContext
	}

	public createServerContext() {
		const cookies = new CookiesStorage(this.config.adapters?.cookies)

		return {
			cookies,
			headers: null,
			request: null,
			config: this.config,
			logger: this.logger,
			wordpress: this.wordpress,
			settings: this.settings,
			email: this.email,
			getAuthUser: this.createGetUserFn(null),
			getConnInfo: this.createConnInfoFn(null),
			verifyCaptcha: this.createVerifyCaptchaFn(null),
			verifyPreviewToken: this.createVerifyPreviewTokenFn(),
			invokedBy: "server",
		} satisfies ProcedureContext
	}

	private createRestCookieStorage(request: Request, headers: Headers): CookiesStorage {
		return new CookiesStorage({
			getAll: async () => {
				const cookieHeader = request.headers.get("cookie")
				if (!cookieHeader) return []

				const cookies: Cookie[] = []

				for (const cookie of cookieHeader.split(";")) {
					const [name, ...valueParts] = cookie.trim().split("=")
					if (!name?.trim()) continue
					cookies.push({ name: name.trim(), value: valueParts.join("=").trim() })
				}

				return cookies
			},
			setAll: async (cookies) => {
				cookies.forEach((cookie) => {
					headers.append("Set-Cookie", serialize(cookie.name, cookie.value, cookie.options))
				})
			},
			deleteAll: async (cookies: { name: string; options?: CookieOptions }[]) => {
				cookies.forEach((cookie) => {
					headers.append("Set-Cookie", serialize(cookie.name, "", { ...cookie.options, maxAge: 0, expires: new Date(0) }))
				})
			},
		})
	}

	private createVerifyCaptchaFn(request: Request | null): VerifyCaptchaFn {
		return async (token) => {
			const connInfo = (await this.config.adapters?.geo?.getConnInfo?.(request)) ?? null
			return (await this.config.adapters?.captcha?.({ ip: connInfo?.ip ?? "unknown-ip", token })) ?? false
		}
	}

	private createConnInfoFn(request: Request | null): ConnInfoFn {
		return async () => {
			return (await this.config.adapters?.geo?.getConnInfo?.(request)) ?? null
		}
	}

	private createGetUserFn(request: Request | null): AuthUserFn {
		return async () => {
			return (await Promise.resolve(this.config.adapters?.auth?.getUser?.(request))) ?? null
		}
	}

	private createVerifyPreviewTokenFn(): VerifyPreviewTokenFn {
		return async (token) => {
			const [, decoded] = tryCatchSync(() => base64Decode<{ payload: PreviewTokenPayload; hash: string }>(token))
			if (!decoded) return null

			const { data, error } = PreviewTokenData.safeParse(decoded)
			if (error) return null

			if (Date.now() > data.payload.expires * 1000) return null

			const payloadStr = `${data.payload.id}.${data.payload.parent}.${data.payload.expires}`
			const expected = await hmac(this.config.siteSecret ?? "", payloadStr)

			const isValid = await compare(expected, data.hash)
			if (!isValid) return null

			return data.payload
		}
	}

	private createLogger(): Logger {
		const adapter = this.config.adapters?.logger ?? noopAdapter

		function build(boundContext: Record<string, unknown>): Logger {
			const emit = (level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error) => {
				const mergedContext = { ...boundContext, ...context }

				void adapter({
					level,
					error,
					message,
					timestamp: new Date(),
					context: Object.keys(mergedContext).length > 0 ? mergedContext : undefined,
				})
			}

			return {
				debug: (msg, ctx) => emit("debug", msg, ctx),
				info: (msg, ctx) => emit("info", msg, ctx),
				warn: (msg, ctx) => emit("warn", msg, ctx),
				error: (msg, err, ctx) => emit("error", msg, ctx, err),
				child: (ctx) => build({ ...boundContext, ...ctx }),
			}
		}

		return build({})
	}
}
