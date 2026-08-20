import {
	base64Decode,
	type Cookie,
	type CookieOptions,
	EXTENSION_VERSIONS_HEADER,
	type ExtensionPluginRequirement,
	extensionUpdateMessage,
	isPluginVersionSupported,
	PLUGIN_VERSION_HEADER,
	parseExtensionVersions,
	pluginUpdateMessage,
	satisfiesVersion,
	tryCatchSync,
} from "@kizlo/shared"
import { stringifySetCookie } from "cookie"
import type { AuthUser } from "./adapters/auth"
import type { ConnInfo } from "./adapters/geo"
import { type Logger, type LogLevel, noopAdapter } from "./adapters/logger"
import { CookiesStorage } from "./cookie"
import { EmailService } from "./email/service"
import type { ServiceAdapters } from "./kizlo"
import { SettingsService } from "./settings/service"
import { compare, hmac } from "./shared/crypto"
import { PreviewTokenData, type PreviewTokenPayload } from "./shared/schema"
import type { ActiveWordPressClient, WordPressCredentials, WordPressTransportResult } from "./wordpress"
import { createWordPressClient, WordPressTransport } from "./wordpress"

const warningRegistryKey = Symbol.for("kizlo.reportedWordPressWarnings")
const warningRegistry = globalThis as typeof globalThis & Record<symbol, Set<string> | undefined>

/** Runtime setup warnings already printed, shared by every bundled copy in this JavaScript realm. */
const reportedWordPressWarnings = warningRegistry[warningRegistryKey] ?? new Set<string>()
warningRegistry[warningRegistryKey] = reportedWordPressWarnings

/**
 * Claim a warning once in this realm and, when running in a child-process worker pool, once across
 * sibling workers. Next.js prerenders pages in forked workers that cannot share `globalThis`, but do
 * share a parent PID. The short-lived lock disappears with the worker pool; if the runtime cannot
 * create it, keep the warning visible rather than failing application work or hiding the problem.
 */
function claimWordPressWarning(key: string): boolean {
	if (reportedWordPressWarnings.has(key)) return false
	reportedWordPressWarnings.add(key)
	if (typeof process === "undefined" || typeof process.send !== "function") return true

	try {
		const crypto = process.getBuiltinModule("node:crypto")
		const fs = process.getBuiltinModule("node:fs")
		const os = process.getBuiltinModule("node:os")
		const path = process.getBuiltinModule("node:path")
		const digest = crypto.createHash("sha256").update(`${process.cwd()}\0${process.ppid}\0${key}`).digest("hex")
		const lockPath = path.join(os.tmpdir(), `kizlo-warning-${digest}`)
		const descriptor = fs.openSync(lockPath, "wx", 0o600)
		fs.closeSync(descriptor)
		process.on("exit", () => {
			try {
				fs.unlinkSync(lockPath)
			} catch {}
		})
		return true
	} catch (error) {
		return (error as NodeJS.ErrnoException).code !== "EEXIST"
	}
}

export interface ContextConfig {
	siteSecret: string
	adapters?: ServiceAdapters
	credentials: WordPressCredentials
	wordpressEndpoints?: object
	/** WordPress plugins the registered extensions need, checked against what each response reports. */
	extensionPlugins?: ExtensionPluginRequirement[]
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
	wordpress: ActiveWordPressClient
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
	private readonly wordpress: ActiveWordPressClient
	private readonly settings: SettingsService
	private readonly email: EmailService

	constructor(config: ContextConfig) {
		this.config = config
		const options = { credentials: config.credentials, onResult: (result: WordPressTransportResult) => this.warnIfOutdated(result) }
		const transport = new WordPressTransport(options)
		// The generated endpoints are inert data, so the client is the pair: the tree overlaid on the
		// transport it runs against. The cast hands back whatever shape that project's `wordpress.ts` declares.
		this.wordpress = createWordPressClient(transport, config.wordpressEndpoints ?? {}) as ActiveWordPressClient
		this.settings = new SettingsService(this.wordpress)
		this.email = new EmailService(this.wordpress)
		this.logger = this.createLogger()
	}

	/**
	 * Report a request that did not reach Kizlo WordPress, or a WordPress side older than the client
	 * needs. The transport supplies the URL and status even when fetch itself failed; a Kizlo response
	 * supplies the version headers. Emitted through `console.warn` rather than the logger adapter on
	 * purpose: the adapter is optional (it defaults to a no-op), and this is a setup problem every user
	 * must see regardless of whether they've wired up logging.
	 */
	private warnIfOutdated(result: WordPressTransportResult): void {
		const installed = result.headers.get(PLUGIN_VERSION_HEADER)
		if (!installed) {
			const message =
				result.status === 0
					? `Nothing answered the WordPress request to ${result.url}. Check that the URL is correct and reachable.`
					: `The response from ${result.url} did not identify a Kizlo WordPress plugin. Check that the URL is correct and the Kizlo plugin is active.`
			this.warn(message, `connection:${this.config.credentials.url}`)
			return
		}
		if (!isPluginVersionSupported(installed)) this.warn(pluginUpdateMessage(installed))

		const plugins = this.config.extensionPlugins
		if (!plugins?.length) return

		// A plugin whose own requirements failed did not start and is absent from the header, so the
		// same check covers both "too old" and "installed but not running".
		const active = parseExtensionVersions(result.headers.get(EXTENSION_VERSIONS_HEADER))
		for (const plugin of plugins) {
			if (satisfiesVersion(active[plugin.slug], plugin.version)) continue
			this.warn(extensionUpdateMessage(plugin, active[plugin.slug]))
		}
	}

	/** Bold yellow, boxed in dashes so it stands out in a busy dev console. */
	private warn(message: string, key = message): void {
		if (!claimWordPressWarning(key)) return
		const inner = ` ${message} `
		const border = "-".repeat(inner.length + 2)
		console.warn(`\n\x1b[1m\x1b[33m${border}\n|${inner}|\n${border}\x1b[0m\n`)
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
					headers.append("Set-Cookie", stringifySetCookie({ ...cookie.options, name: cookie.name, value: cookie.value }))
				})
			},
			deleteAll: async (cookies: { name: string; options?: CookieOptions }[]) => {
				cookies.forEach((cookie) => {
					headers.append(
						"Set-Cookie",
						stringifySetCookie({ ...cookie.options, name: cookie.name, value: "", maxAge: 0, expires: new Date(0) }),
					)
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
