import { AsyncLocalStorage } from "node:async_hooks"
import { afterEach, describe, expect, test, vi } from "vitest"
import { introspection } from "../../../introspection"
import { authMock } from "./adapters/auth"
import { geoMock } from "./adapters/geo"
import { Context, type ProcedureContext } from "./context"
import * as publicApi from "./index"
import { createKizlo, integrationEnv, Kizlo, resolveKizloConfig, wordPressConnectionComplete } from "./kizlo"
import { CORE_PROCEDURES } from "./procedures"
import { RPC_PROTOCOL_HEADER } from "./shared/constants"
import { KizloError } from "./shared/error"
import { createIntegration } from "./shared/integration"
import { createProcedure, schemaType } from "./shared/procedure"
import { getKizloClientTestInstance } from "./test/client"
import { testRequestContext } from "./test/request-context.test-helper"

afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
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
		// Credentials come from the integration, so a missing baseUrl is the only value left to throw on.
		const wordpressOnly = createIntegration({
			id: "runtime",
			env: {
				remote: { wordpressUrl: credentials.url, wordpressUsername: credentials.username, wordpressPassword: credentials.password },
			},
		})
		const previous = process.env.KIZLO_BASE_URL
		process.env.KIZLO_BASE_URL = "https://ignored.example/api/kizlo"
		try {
			expect(() =>
				resolveKizloConfig({
					siteSecret: "explicit-secret",
					integrations: [wordpressOnly],
				}),
			).toThrow(/"baseUrl" environment value/)
		} finally {
			if (previous === undefined) delete process.env.KIZLO_BASE_URL
			else process.env.KIZLO_BASE_URL = previous
		}
	})

	test("preserves the supplied introspection tree on the resolved config", () => {
		const introspection = { postTypes: { book: {} } }
		const config = resolveKizloConfig({
			introspection,
			integrations: [createIntegration({ id: "runtime", env: runtimeValues })],
		})

		expect(config.introspection).toBe(introspection)
	})

	test("lets explicit baseUrl and siteSecret override integration values", () => {
		const config = resolveKizloConfig({
			baseUrl: "https://explicit.example/api/kizlo",
			siteSecret: "explicit-secret",
			integrations: [createIntegration({ id: "runtime", env: runtimeValues })],
		})

		expect(config).toMatchObject({
			baseUrl: "https://explicit.example/api/kizlo",
			siteSecret: "explicit-secret",
			credentials,
		})
	})
})

describe("wordPressConnectionComplete", () => {
	test("is true when the active profile has every connection value", () => {
		const env = integrationEnv([createIntegration({ id: "runtime", env: runtimeValues })])
		expect(wordPressConnectionComplete(env)).toBe(true)
	})

	test("selects the active profile, so a complete remote does not cover an incomplete local", () => {
		const env = integrationEnv([
			createIntegration({
				id: "runtime",
				env: { ...runtimeValues, mode: "local", local: { wordpressUrl: "http://localhost:8080" } },
			}),
		])
		expect(wordPressConnectionComplete(env)).toBe(false)
	})

	test("is false when a profile value is missing", () => {
		const env = integrationEnv([
			createIntegration({ id: "runtime", env: { ...runtimeValues, remote: { ...runtimeValues.remote, wordpressPassword: undefined } } }),
		])
		expect(wordPressConnectionComplete(env)).toBe(false)
	})
})

const probe = createIntegration({
	id: "probe",
	procedures: { context: createProcedure({ scope: "internal", output: schemaType<ProcedureContext>() }, ({ context }) => context) },
})

function config(integrations?: readonly ReturnType<typeof createIntegration>[]) {
	return {
		baseUrl: "https://app.example",
		siteSecret: "site-secret",
		credentials,
		integrations: [...(integrations ?? []), probe] as const,
	}
}

describe("integration composition", () => {
	test("uses an adapter bundled by a provider integration without app wiring", async () => {
		const kizlo = new Kizlo(config([createIntegration({ id: "provider", adapters: { auth: authMock({ id: "42" }) } })]))

		await expect((await kizlo.client.probe.context.call()).getSession()).resolves.toMatchObject({ id: "42" })
	})

	test("resolves integration adapters from left to right without erasing concrete values", async () => {
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
			integrations: [createIntegration({ id: "runtime", env: runtimeValues }), ...integrations, probe],
		})
		const adapters = (await new Kizlo(resolved).client.probe.context.call()).config.adapters

		expect(adapters).toMatchObject({
			auth: secondAuth,
			captcha,
			logger,
		})
	})

	test("mounts a lower-order integration first even when it is declared last", async () => {
		const frameworkAuth = authMock({ id: "framework" })
		const appAuth = authMock({ id: "app" })

		const resolved = resolveKizloConfig({
			baseUrl: "https://app.example",
			siteSecret: "site-secret",
			integrations: [
				createIntegration({ id: "app", adapters: { auth: appAuth } }),
				createIntegration({ id: "framework", order: -100, env: runtimeValues, adapters: { auth: frameworkAuth } }),
				probe,
			],
		})
		const adapters = (await new Kizlo(resolved).client.probe.context.call()).config.adapters

		expect(adapters).toMatchObject({ auth: appAuth })
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

	test("composes integration env in mount order rather than array order", () => {
		const resolved = resolveKizloConfig({
			integrations: [
				createIntegration({ id: "app", env: { baseUrl: "https://app.example" } }),
				createIntegration({ id: "framework", order: -100, env: { ...runtimeValues, baseUrl: "https://framework.example" } }),
			],
		})

		expect(resolved.baseUrl).toBe("https://app.example")
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

	test("checks integration endpoint requirements against the supplied introspection", () => {
		const runtime = createIntegration({ id: "runtime", env: runtimeValues })
		const needsRoute = createIntegration({ id: "shop", requires: { endpoints: ["store.cart"] } })

		expect(() => createKizlo({ integrations: [runtime, needsRoute] })).toThrow(/store\.cart/)
		expect(() => createKizlo({ introspection: { store: { cart: {} } }, integrations: [runtime, needsRoute] })).not.toThrow()
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

	test("collects events in mount order rather than array order", () => {
		const app = { handler: vi.fn() }
		const framework = { handler: vi.fn() }
		const kizlo = new Kizlo(
			config([createIntegration({ id: "app", events: [app] }), createIntegration({ id: "framework", order: -100, events: [framework] })]),
		)
		const registered = (kizlo as unknown as { registerIntegrations(): { events: unknown[] } }).registerIntegrations()

		expect(registered.events).toEqual([framework, app])
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
	test("logging enables the built-in console adapter at the selected level", async () => {
		const debug = vi.spyOn(console, "debug").mockImplementation(() => {})
		const info = vi.spyOn(console, "info").mockImplementation(() => {})
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
		const error = vi.spyOn(console, "error").mockImplementation(() => {})
		const kizlo = new Kizlo({ ...config(), logging: "warn" })
		const { logger } = await kizlo.client.probe.context.call()

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
				errorInterceptor(): (options: { context: ProcedureContext; next: () => Promise<never> }) => Promise<never>
			}
		).errorInterceptor()

		await expect(
			interceptor({
				context: new Context({ ...config(), adapters: { logger } }).createServerContext(),
				next: () => Promise.reject(failure),
			}),
		).rejects.toBe(failure)
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
	test.each(["api", "remote"] as const)("keeps unwrapped %s responses private, including errors and unmatched routes", async (scope) => {
		const server = new Kizlo({
			baseUrl: "https://app.example/api/kizlo",
			siteSecret: "site-secret",
			credentials,
			integrations: [
				createIntegration({
					id: "probe",
					procedures: {
						who: createProcedure({ scope, method: "GET", path: "/who", output: schemaType<string | null>() }, async ({ context }) => {
							for (const name of ["Cache-Control", "CDN-Cache-Control", "Cloudflare-CDN-Cache-Control"]) {
								context.headers?.set(name, "public, max-age=3600")
							}
							context.headers?.set("Cache-Tag", "private-session")
							context.headers?.append("Set-Cookie", "one=1; HttpOnly")
							context.headers?.append("Set-Cookie", "two=2; HttpOnly")
							return context.request?.headers.get("cookie") ?? null
						}),
						failure: createProcedure({ scope, method: "GET", path: "/failure", output: schemaType<never>() }, async () => {
							throw new KizloError("FORBIDDEN", { message: "Private failure" })
						}),
						crash: createProcedure({ scope, method: "GET", path: "/crash", output: schemaType<never>() }, async () => {
							throw new Error("Unexpected failure")
						}),
					},
				}),
			] as const,
		})
		const responses: Response[] = []
		const invoke = async (request: Request) => {
			request.headers.set("Cookie", "session=alice")
			const response = await server.handler(request)
			responses.push(response)
			return response
		}
		const { client } = await getKizloClientTestInstance(server, { url: "https://app.example/api/kizlo", fetch: invoke })
		const probe = client.probe
		if (!probe) throw new Error("Expected registered probe procedures")
		expect(await probe.who()).toMatchObject({ success: true, data: "session=alice" })
		expect(await probe.failure()).toMatchObject({ success: false, error: { status: 403, message: "Private failure" } })
		expect(await probe.crash()).toMatchObject({ success: false, error: { status: 500 } })
		const missing = await invoke(
			new Request("https://app.example/api/kizlo/missing", { headers: scope === "remote" ? { [RPC_PROTOCOL_HEADER]: "1" } : {} }),
		)
		expect(await missing.text()).toBe("Not Found")
		expect(responses.map(({ status }) => status)).toEqual([200, 403, 500, 404])
		for (const response of responses) {
			expect(response.headers.get("Cache-Control")).toBe("private, no-store")
			for (const name of ["CDN-Cache-Control", "Cloudflare-CDN-Cache-Control", "Cache-Tag"]) expect(response.headers.has(name)).toBe(false)
			if (response.status === 200) expect(response.headers.getSetCookie()).toEqual(["one=1; HttpOnly", "two=2; HttpOnly"])
		}
	})

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

describe("configured WordPress access", () => {
	test.each([
		{ env: runtimeValues, active: runtimeValues.remote },
		{ env: localRuntimeValues, active: localRuntimeValues.local },
	])("destructures the generated client using the active connection", async ({ env, active }) => {
		const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
			Response.json({ id: 7 }, { headers: { "x-kizlo-version": "999.0.0" } }),
		)
		vi.stubGlobal("fetch", fetch)
		const { wordpress } = createKizlo({ integrations: [createIntegration({ id: "runtime", env })], introspection })
		expect(fetch).not.toHaveBeenCalled()

		const result = await wordpress.kizlo.postTypes.post.retrieve({ params: { identifier: "hello world" } })
		expect(fetch).toHaveBeenCalledWith(
			`${active.wordpressUrl}/wp-json/kizlo/v1/post-types/post/hello%20world`,
			expect.objectContaining({ method: "GET" }),
		)
		expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get("authorization")).toBe(
			`Basic ${btoa(`${active.wordpressUsername}:${active.wordpressPassword}`)}`,
		)
		expect(result).toMatchObject({ data: { id: 7 }, error: null, status: 200 })
		expect(wordpress.get).toBeTypeOf("function")
	})

	test("resolves the current trusted IP for each call on a destructured client", async () => {
		let ip = "203.0.113.1"
		const getConnInfo = vi.fn(() => geoMock({ ip }).getConnInfo(null))
		const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
			Response.json({}, { headers: { "x-kizlo-version": "999.0.0" } }),
		)
		vi.stubGlobal("fetch", fetch)
		const { wordpress } = createKizlo({
			integrations: [createIntegration({ id: "runtime", env: runtimeValues, adapters: { geo: { getConnInfo } } })],
			introspection,
		})
		expect(getConnInfo).not.toHaveBeenCalled()
		await wordpress.kizlo.postTypes.post.retrieve({ params: { identifier: "first" } })
		ip = "2001:db8::2"
		await wordpress.kizlo.postTypes.post.retrieve({ params: { identifier: "second" } })

		expect(fetch.mock.calls.map(([, init]) => new Headers(init?.headers).get("x-real-ip"))).toEqual(["203.0.113.1", "2001:db8::2"])
		expect(getConnInfo).toHaveBeenCalledTimes(2)
		expect(getConnInfo).toHaveBeenCalledWith(null)
	})

	test("keeps plugin compatibility diagnostics on direct WordPress calls", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({}, { headers: { "x-kizlo-version": "0.0.1" } })),
		)
		const { wordpress } = createKizlo({ integrations: [createIntegration({ id: "runtime", env: runtimeValues })] })
		await wordpress.get("wp-json/kizlo/v1/settings", {})
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("0.0.1"))
	})

	test("does not export independent WordPress client initialization", () => {
		expect(publicApi).not.toHaveProperty("createWordPressClient")
		expect(publicApi.wpEndpoint).toBeTypeOf("function")
		expect(publicApi.buildWordPressRequest).toBeTypeOf("function")
	})
})

describe("native request context", () => {
	const scope = testRequestContext()
	const runtime = createIntegration({ id: "test-runtime", adapters: { requestContext: scope } })
	type Values = { env?: { SITE: string }; executionCtx?: { waitUntil: (work: Promise<unknown>) => void } }
	const createServer = () => {
		const server = new Kizlo({
			baseUrl: "https://app.example/api",
			siteSecret: "secret",
			credentials,
			integrations: [
				runtime,
				createIntegration({
					id: "probe",
					procedures: {
						info: createProcedure(
							{
								scope: "api",
								method: "GET",
								path: "/info",
								output: schemaType<{ site: string | null; url: string | null; native: boolean }>(),
							},
							async ({ context }) => {
								const values = context as ProcedureContext & Values
								await Promise.resolve()
								return { site: values.env?.SITE ?? null, url: context.request?.url ?? null, native: !!values.executionCtx }
							},
						),
					},
				}),
			] as const,
		})
		const probe = server.client.probe
		if (!probe) throw new Error("Expected registered probe procedures")
		return { server, probe }
	}
	test("handler values reach HTTP procedures in isolation without changing the server instance", async () => {
		const { server, probe } = createServer()
		await Promise.all(
			["first", "second"].map(async (SITE) => {
				const executionCtx = { waitUntil: vi.fn() }
				const request = new Request(`https://app.example/api/info?site=${SITE}`)
				const response = await server.handler(request, { env: { SITE }, executionCtx })
				expect(await response.json()).toEqual({ site: SITE, url: request.url, native: true })
			}),
		)
		expect((await probe.info()).data).toEqual({ site: null, url: null, native: false })
	})
	test("an optional runtime adapter supplies ambient values and allows explicit HTTP overrides", async () => {
		const { server, probe } = createServer()
		let later!: () => ReturnType<typeof probe.info>
		const request = new Request("https://app.example/page")
		const response = await scope.run(request, { env: { SITE: "outer" }, executionCtx: { waitUntil: vi.fn() } }, async () => {
			later = AsyncLocalStorage.bind(() => probe.info())
			expect((await probe.info()).data).toEqual({ site: "outer", url: request.url, native: true })
			const api = new Request("https://app.example/api/info")
			const response = await server.handler(api, { env: { SITE: "override" } })
			expect(await response.json()).toEqual({ site: "override", url: api.url, native: true })
			expect((await probe.info()).data?.site).toBe("outer")
			return new Response("rendered")
		})
		expect(await response.text()).toBe("rendered")
		expect((await later()).data).toEqual({ site: null, url: null, native: false })
	})

	test("explicit HTTP values reach nested server-client invocations", async () => {
		let callInner!: () => Promise<string | null>
		const server = new Kizlo({
			baseUrl: "https://app.example/api",
			siteSecret: "secret",
			credentials,
			integrations: [
				runtime,
				createIntegration({
					id: "probe",
					procedures: {
						inner: createProcedure(
							{ scope: "internal", output: schemaType<string | null>() },
							async ({ context }) => (context as ProcedureContext & Values).env?.SITE ?? null,
						),
						outer: createProcedure({ scope: "api", method: "GET", path: "/outer", output: schemaType<string | null>() }, async () =>
							callInner(),
						),
					},
				}),
			] as const,
		})
		const probe = server.client.probe
		if (!probe) throw new Error("Expected registered probe procedures")
		callInner = async () => {
			const result = await probe.inner()
			if (result.error) throw result.error
			return result.data ?? null
		}
		const response = await server.handler(new Request("https://app.example/api/outer"), { env: { SITE: "nested" } })
		expect(await response.json()).toBe("nested")
		expect(await callInner()).toBeNull()
	})
	test("caller additions cannot overwrite Kizlo-owned context fields", async () => {
		const { server } = createServer()
		const request = new Request("https://app.example/api/info")
		const response = await server.handler(request, { env: { SITE: "safe" }, request: null, wordpress: null, headers: null })
		expect(await response.json()).toEqual({ site: "safe", url: request.url, native: false })
	})
	test.each([null, "invalid", []])("rejects malformed request additions: %j", async (values) => {
		const { server } = createServer()
		// @ts-expect-error request additions are objects, even without augmentation
		await expect(server.handler(new Request("https://app.example/api/info"), values)).rejects.toThrow("Request context must be an object")
	})
})
