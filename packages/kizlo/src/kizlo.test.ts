import { afterEach, describe, expect, test, vi } from "vitest"
import { authMock } from "./adapters/auth"
import type { ProcedureContext } from "./context"
import { Kizlo, resolveKizloConfig } from "./kizlo"
import { CORE_PROCEDURES } from "./procedures"
import { createIntegration } from "./shared/integration"

afterEach(() => {
	vi.restoreAllMocks()
})

const credentials = { url: "https://wp.example", username: "admin", password: "secret" }

const runtimeValues = {
	baseUrl: "https://app.example.com/api/kizlo",
	remote: {
		siteSecret: "site-secret",
		wordpressUrl: credentials.url,
		wordpressUsername: credentials.username,
		wordpressPassword: credentials.password,
	},
}

const localRuntimeValues = {
	...runtimeValues,
	mode: "local",
	local: {
		siteSecret: "local-site-secret",
		wordpressUrl: "http://localhost:8080",
		wordpressUsername: "local-admin",
		wordpressPassword: "local-secret",
	},
}

describe("resolveKizloConfig environment boundary", () => {
	test("resolves camel-case values contributed by an integration", () => {
		const config = resolveKizloConfig({ integrations: [createIntegration({ id: "runtime", env: runtimeValues })] })

		expect(config).toMatchObject({
			baseUrl: runtimeValues.baseUrl,
			siteSecret: runtimeValues.remote.siteSecret,
			credentials,
		})
	})

	test("selects the local WordPress values after integrations map them", () => {
		const config = resolveKizloConfig({ integrations: [createIntegration({ id: "runtime", env: localRuntimeValues })] })

		expect(config).toMatchObject({
			baseUrl: runtimeValues.baseUrl,
			siteSecret: localRuntimeValues.local.siteSecret,
			credentials: {
				url: localRuntimeValues.local.wordpressUrl,
				username: localRuntimeValues.local.wordpressUsername,
				password: localRuntimeValues.local.wordpressPassword,
			},
		})
	})

	test("checks requirements against the selected local values", () => {
		const env = {
			...localRuntimeValues,
			remote: undefined,
		}
		const runtime = createIntegration({
			id: "runtime",
			env,
			requires: { env: ["siteSecret", "local.wordpressUrl", "local.wordpressUsername", "local.wordpressPassword"] },
		})

		expect(() => resolveKizloConfig({ integrations: [runtime] })).not.toThrow()
	})

	test("validates the canonical WordPress mode after mapping", () => {
		expect(() =>
			resolveKizloConfig({
				integrations: [createIntegration({ id: "runtime", env: { ...runtimeValues, mode: "preview" } })],
			}),
		).toThrow('The "mode" environment value must be "local" or "remote", got "preview".')
	})

	test("does not read runtime environment variables itself", () => {
		const previous = process.env.KIZLO_BASE_URL
		process.env.KIZLO_BASE_URL = "https://ignored.example/api/kizlo"
		try {
			expect(() =>
				resolveKizloConfig({
					siteSecret: "explicit-secret",
					wordpress: { credentials },
				}),
			).toThrow(/"baseUrl" environment value/)
		} finally {
			if (previous === undefined) delete process.env.KIZLO_BASE_URL
			else process.env.KIZLO_BASE_URL = previous
		}
	})

	test("lets explicit options configure Kizlo without an integration", () => {
		const config = resolveKizloConfig({
			baseUrl: "https://explicit.example/api/kizlo",
			siteSecret: "explicit-secret",
			wordpress: { credentials },
		})

		expect(config).toMatchObject({
			baseUrl: "https://explicit.example/api/kizlo",
			siteSecret: "explicit-secret",
			credentials,
		})
	})

	test("lets explicit options override integration values", () => {
		const config = resolveKizloConfig({
			baseUrl: "https://explicit.example/api/kizlo",
			siteSecret: "explicit-secret",
			wordpress: { credentials: { username: "explicit-user" } },
			integrations: [createIntegration({ id: "runtime", env: runtimeValues })],
		})

		expect(config).toMatchObject({
			baseUrl: "https://explicit.example/api/kizlo",
			siteSecret: "explicit-secret",
			credentials: { ...credentials, username: "explicit-user" },
		})
	})
})

function config(integrations?: readonly ReturnType<typeof createIntegration>[]) {
	return {
		baseUrl: "https://app.example",
		siteSecret: "site-secret",
		credentials,
		integrations,
	}
}

describe("integration composition", () => {
	test("uses an adapter bundled by a provider integration without app wiring", async () => {
		const kizlo = new Kizlo(config([createIntegration({ id: "provider", adapters: { auth: authMock({ id: "42" }) } })]))

		await expect(kizlo.context.createServerContext().getSession()).resolves.toMatchObject({ id: "42" })
	})

	test("resolves integration adapters from left to right without erasing concrete values", () => {
		const firstAuth = authMock({ id: "1" })
		const secondAuth = authMock({ id: "2" })
		const logger = vi.fn()
		const captcha = vi.fn(async () => true)
		const integrations = [
			createIntegration({ id: "first", adapters: { auth: firstAuth, captcha, logger } }),
			createIntegration({ id: "second", adapters: { auth: secondAuth, captcha: undefined, logger: undefined } }),
		] as const

		const resolved = resolveKizloConfig({
			baseUrl: "https://app.example",
			siteSecret: "site-secret",
			logging: "debug",
			wordpress: { credentials },
			integrations,
		})
		const adapters = new Kizlo(resolved).context.createServerContext().config.adapters

		expect(adapters).toMatchObject({
			auth: secondAuth,
			captcha,
			logger,
		})
	})

	test("resolves integration env from left to right without erasing concrete values", () => {
		const resolved = resolveKizloConfig({
			integrations: [
				createIntegration({ id: "runtime", env: { ...runtimeValues, baseUrl: "https://base.example" } }),
				createIntegration({ id: "framework", env: { baseUrl: "https://first.example" } }),
				createIntegration({
					id: "provider",
					env: { baseUrl: undefined, remote: { wordpressUsername: "second-user", wordpressPassword: undefined } },
				}),
			],
		})

		expect(resolved.baseUrl).toBe("https://first.example")
		expect(resolved.credentials.username).toBe("second-user")
		expect(resolved.credentials.password).toBe(credentials.password)
	})

	test("checks integration env requirements against the fully composed environment", () => {
		const integrations = [
			createIntegration({ id: "consumer", requires: { env: ["providerSecret"] } }),
			createIntegration({ id: "runtime", env: runtimeValues }),
			createIntegration({ id: "provider", env: { providerSecret: "secret" } }),
		] as const

		expect(() => resolveKizloConfig({ integrations })).not.toThrow()
	})

	test("rejects a missing integration env requirement before server creation", () => {
		expect(() =>
			resolveKizloConfig({
				integrations: [
					createIntegration({ id: "provider", requires: { env: ["providerSecret"] } }),
					createIntegration({ id: "runtime", env: runtimeValues }),
				],
			}),
		).toThrow(/"provider" integration.*providerSecret/)
	})

	test("keeps adapter-only and empty-procedure integrations out of the procedure tree", () => {
		const kizlo = new Kizlo(
			config([
				createIntegration({ id: "adapter-only", adapters: { auth: authMock() } }),
				createIntegration({ id: "empty", procedures: {} }),
			]),
		)

		expect(kizlo.procedures).not.toHaveProperty("adapter-only")
		expect(kizlo.procedures).not.toHaveProperty("empty")
	})

	test("preserves declared event order across integrations", () => {
		const first = { handler: vi.fn() }
		const second = { handler: vi.fn() }
		const third = { handler: vi.fn() }
		const kizlo = new Kizlo(
			config([createIntegration({ id: "first", events: [first, second] }), createIntegration({ id: "second", events: [third] })]),
		)
		const registered = (kizlo as unknown as { registerIntegrations(): { events: unknown[] } }).registerIntegrations()

		expect(registered.events).toEqual([first, second, third])
	})

	test("rejects duplicate integration ids with the startup error code", () => {
		let thrown: unknown
		try {
			new Kizlo(config([createIntegration({ id: "provider" }), createIntegration({ id: "provider" })]))
		} catch (error) {
			thrown = error
		}

		expect(thrown).toMatchObject({ code: "INTEGRATION_ID_CONFLICT" })
		expect(thrown).toHaveProperty(
			"message",
			'The integration id "provider" is registered more than once. Give every integration a unique id.',
		)
	})

	test.each([...Object.keys(CORE_PROCEDURES), "webhooks"])("rejects the reserved integration id %s", (id) => {
		let thrown: unknown
		try {
			new Kizlo(config([createIntegration({ id })]))
		} catch (error) {
			thrown = error
		}

		expect(thrown).toMatchObject({ code: "INTEGRATION_ID_CONFLICT" })
		expect(thrown).toHaveProperty("message", `The integration id "${id}" is reserved by Kizlo. Choose a different integration id.`)
	})
})

describe("request error interceptor", () => {
	test("logging enables the built-in console adapter at the selected level", () => {
		const debug = vi.spyOn(console, "debug").mockImplementation(() => {})
		const info = vi.spyOn(console, "info").mockImplementation(() => {})
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
		const error = vi.spyOn(console, "error").mockImplementation(() => {})
		const kizlo = new Kizlo({ ...config(), logging: "warn" })
		const logger = kizlo.context.createServerContext().logger

		logger.debug("debug")
		logger.info("info")
		logger.warn("warn")
		logger.error("error")

		expect(debug).not.toHaveBeenCalled()
		expect(info).not.toHaveBeenCalled()
		expect(warn).toHaveBeenCalledOnce()
		expect(error).toHaveBeenCalledOnce()
	})

	test("reports unexpected errors through the logger and preserves the thrown error", async () => {
		const failure = new Error("unexpected failure")
		const logger = vi.fn()
		const kizlo = new Kizlo({
			baseUrl: "https://app.example",
			siteSecret: "site-secret",
			integrations: [createIntegration({ id: "logger", adapters: { logger } })],
			credentials,
		})
		const interceptor = (
			kizlo as unknown as {
				errorInterceptor(): (options: {
					context: ReturnType<typeof kizlo.context.createServerContext>
					next: () => Promise<never>
				}) => Promise<never>
			}
		).errorInterceptor()

		await expect(interceptor({ context: kizlo.context.createServerContext(), next: () => Promise.reject(failure) })).rejects.toBe(failure)
		expect(logger).toHaveBeenCalledOnce()
		expect(logger).toHaveBeenCalledWith(
			expect.objectContaining({
				level: "error",
				message: "Request handler failed",
				error: failure,
			}),
		)
	})
})

describe("response headers", () => {
	test("forwards each cookie once when a response sets multiple cookies", async () => {
		const kizlo = new Kizlo({
			baseUrl: "https://app.example",
			siteSecret: "site-secret",
			credentials: { url: "https://wp.example", username: "admin", password: "secret" },
		})
		const openapiHandler = (
			kizlo as unknown as {
				openapiHandler: {
					handle: (request: Request, options: { context: ProcedureContext }) => Promise<{ matched: true; response: Response }>
				}
			}
		).openapiHandler
		vi.spyOn(openapiHandler, "handle").mockImplementation(async (_request, { context }) => {
			context.headers?.append("Set-Cookie", "session=one; Path=/")
			context.headers?.append("Set-Cookie", "preference=two; Path=/")
			context.headers?.set("X-Context", "forwarded")
			return { matched: true, response: new Response(null) }
		})

		const response = await kizlo.handler(new Request("https://app.example/test"))

		expect(response.headers.getSetCookie()).toEqual(["session=one; Path=/", "preference=two; Path=/"])
		expect(response.headers.get("X-Context")).toBe("forwarded")
	})
})
