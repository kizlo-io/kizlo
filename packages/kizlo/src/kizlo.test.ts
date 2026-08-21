import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { Kizlo, resolveKizloConfig } from "./kizlo"

const KEYS = [
	"KIZLO_CONNECT",
	"KIZLO_WP_SECRET",
	"KIZLO_LOCAL_WP_SECRET",
	"KIZLO_WP_URL",
	"KIZLO_WP_USERNAME",
	"KIZLO_WP_APP_PASSWORD",
	"KIZLO_LOCAL_WP_URL",
	"KIZLO_LOCAL_WP_USERNAME",
	"KIZLO_LOCAL_WP_APP_PASSWORD",
] as const

const REMOTE = {
	KIZLO_WP_SECRET: "remote-secret",
	KIZLO_WP_URL: "https://remote.example.com",
	KIZLO_WP_USERNAME: "remote-user",
	KIZLO_WP_APP_PASSWORD: "remote-pass",
}

const LOCAL = {
	KIZLO_LOCAL_WP_SECRET: "local-secret",
	KIZLO_LOCAL_WP_URL: "http://localhost:8080",
	KIZLO_LOCAL_WP_USERNAME: "local-user",
	KIZLO_LOCAL_WP_APP_PASSWORD: "local-pass",
}

const saved: Record<string, string | undefined> = {}

const resolve = (options?: Parameters<typeof resolveKizloConfig>[0]) =>
	resolveKizloConfig({ baseUrl: "https://app.example.com", ...options }, { baseUrlEnvKey: "KIZLO_API_URL" })

describe("resolveKizloConfig connect selection", () => {
	beforeEach(() => {
		for (const key of KEYS) {
			saved[key] = process.env[key]
			delete process.env[key]
		}
		Object.assign(process.env, REMOTE, LOCAL)
	})

	afterEach(() => {
		for (const key of KEYS) {
			if (saved[key] === undefined) delete process.env[key]
			else process.env[key] = saved[key]
		}
	})

	test("defaults to remote keys", () => {
		const config = resolve()
		expect(config.connect).toBe("remote")
		expect(config.siteSecret).toBe("remote-secret")
		expect(config.credentials).toEqual({ url: REMOTE.KIZLO_WP_URL, username: "remote-user", password: "remote-pass" })
	})

	test('connect: "local" reads the KIZLO_LOCAL_WP_* / KIZLO_LOCAL_WP_SECRET keys', () => {
		const config = resolve({ connect: "local" })
		expect(config.connect).toBe("local")
		expect(config.siteSecret).toBe("local-secret")
		expect(config.credentials).toEqual({ url: LOCAL.KIZLO_LOCAL_WP_URL, username: "local-user", password: "local-pass" })
	})

	test("KIZLO_CONNECT=local selects the local set with no explicit option", () => {
		process.env.KIZLO_CONNECT = "local"
		const config = resolve()
		expect(config.connect).toBe("local")
		expect(config.siteSecret).toBe("local-secret")
	})

	test("the explicit option overrides KIZLO_CONNECT", () => {
		process.env.KIZLO_CONNECT = "local"
		const config = resolve({ connect: "remote" })
		expect(config.connect).toBe("remote")
		expect(config.credentials.url).toBe(REMOTE.KIZLO_WP_URL)
	})

	test("an unrecognized KIZLO_CONNECT throws naming the bad value", () => {
		process.env.KIZLO_CONNECT = "dev"
		expect(() => resolve()).toThrow(/KIZLO_CONNECT must be "local" or "remote", got "dev"/)
	})

	test("a missing local key throws an error naming the resolved key", () => {
		delete process.env.KIZLO_LOCAL_WP_URL
		expect(() => resolve({ connect: "local" })).toThrow(/KIZLO_LOCAL_WP_URL/)
	})
})

describe("request error interceptor", () => {
	test("reports unexpected errors through the logger and preserves the thrown error", async () => {
		const failure = new Error("unexpected failure")
		const logger = vi.fn()
		const kizlo = new Kizlo({
			baseUrl: "https://app.example",
			siteSecret: "site-secret",
			environment: "test",
			connect: "remote",
			adapters: { logger },
			credentials: { url: "https://wp.example", username: "admin", password: "secret" },
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
