import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { resolveKizloConfig } from "./kizlo"

const KEYS = [
	"KIZLO_TARGET",
	"KIZLO_SITE_SECRET",
	"KIZLO_DEV_SITE_SECRET",
	"KIZLO_WORDPRESS_URL",
	"KIZLO_WORDPRESS_USERNAME",
	"KIZLO_WORDPRESS_APPLICATION_PASSWORD",
	"KIZLO_DEV_WORDPRESS_URL",
	"KIZLO_DEV_WORDPRESS_USERNAME",
	"KIZLO_DEV_WORDPRESS_APPLICATION_PASSWORD",
] as const

const PROD = {
	KIZLO_SITE_SECRET: "prod-secret",
	KIZLO_WORDPRESS_URL: "https://prod.example.com",
	KIZLO_WORDPRESS_USERNAME: "prod-user",
	KIZLO_WORDPRESS_APPLICATION_PASSWORD: "prod-pass",
}

const DEV = {
	KIZLO_DEV_SITE_SECRET: "dev-secret",
	KIZLO_DEV_WORDPRESS_URL: "http://localhost:8080",
	KIZLO_DEV_WORDPRESS_USERNAME: "dev-user",
	KIZLO_DEV_WORDPRESS_APPLICATION_PASSWORD: "dev-pass",
}

const saved: Record<string, string | undefined> = {}

// baseUrl is passed as an option so the resolver never needs the framework's base-URL env var.
const resolve = (options?: Parameters<typeof resolveKizloConfig>[0]) =>
	resolveKizloConfig({ baseUrl: "https://app.example.com", ...options }, { baseUrlEnvKey: "KIZLO_BACKEND_URL" })

describe("resolveKizloConfig target selection", () => {
	beforeEach(() => {
		for (const key of KEYS) {
			saved[key] = process.env[key]
			delete process.env[key]
		}
		Object.assign(process.env, PROD, DEV)
	})

	afterEach(() => {
		for (const key of KEYS) {
			if (saved[key] === undefined) delete process.env[key]
			else process.env[key] = saved[key]
		}
	})

	test("defaults to production keys", () => {
		const config = resolve()
		expect(config.target).toBe("production")
		expect(config.siteSecret).toBe("prod-secret")
		expect(config.credentials).toEqual({ url: PROD.KIZLO_WORDPRESS_URL, username: "prod-user", password: "prod-pass" })
	})

	test('target: "dev" reads the KIZLO_DEV_WORDPRESS_* / KIZLO_DEV_SITE_SECRET keys', () => {
		const config = resolve({ target: "dev" })
		expect(config.target).toBe("dev")
		expect(config.siteSecret).toBe("dev-secret")
		expect(config.credentials).toEqual({ url: DEV.KIZLO_DEV_WORDPRESS_URL, username: "dev-user", password: "dev-pass" })
	})

	test("KIZLO_TARGET=dev selects the dev set with no explicit option", () => {
		process.env.KIZLO_TARGET = "dev"
		const config = resolve()
		expect(config.target).toBe("dev")
		expect(config.siteSecret).toBe("dev-secret")
	})

	test("the explicit option overrides KIZLO_TARGET", () => {
		process.env.KIZLO_TARGET = "dev"
		const config = resolve({ target: "production" })
		expect(config.target).toBe("production")
		expect(config.credentials.url).toBe(PROD.KIZLO_WORDPRESS_URL)
	})

	test("a missing dev key throws an error naming the resolved key", () => {
		delete process.env.KIZLO_DEV_WORDPRESS_URL
		expect(() => resolve({ target: "dev" })).toThrow(/KIZLO_DEV_WORDPRESS_URL/)
	})
})
