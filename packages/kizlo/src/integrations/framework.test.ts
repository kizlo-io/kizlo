import { describe, expect, test } from "vitest"
import { readEnv } from "../shared/integration"
import { astro } from "./astro/integration"
import { nextjs } from "./nextjs/integration"
import { node } from "./node/integration"
import { tanstackStart } from "./tanstack-start/integration"

describe("framework integrations", () => {
	const wordpress = {
		KIZLO_MODE: "remote",
		KIZLO_WP_URL: "https://wp.example",
		KIZLO_WP_USERNAME: "admin",
		KIZLO_WP_APP_PASSWORD: "password",
		KIZLO_WP_SECRET: "remote-secret",
		KIZLO_LOCAL_WP_URL: "http://localhost:8080",
		KIZLO_LOCAL_WP_USERNAME: "local-admin",
		KIZLO_LOCAL_WP_APP_PASSWORD: "local-password",
		KIZLO_LOCAL_WP_SECRET: "local-secret",
	}

	test("maps each runtime public URL onto baseUrl", () => {
		const next = nextjs({ env: { NEXT_PUBLIC_KIZLO_BASE_URL: "https://next.example/api/kizlo" }, revalidate: false })
		const astroIntegration = astro({ env: { PUBLIC_KIZLO_BASE_URL: "https://astro.example/api/kizlo" } })
		const tanstack = tanstackStart({ env: { VITE_KIZLO_BASE_URL: "https://tanstack.example/api/kizlo" } })
		const nodeIntegration = node({ env: { KIZLO_BASE_URL: "https://node.example/api/kizlo" } })

		expect(readEnv(next.env ?? {}, "baseUrl")).toBe("https://next.example/api/kizlo")
		expect(readEnv(astroIntegration.env ?? {}, "baseUrl")).toBe("https://astro.example/api/kizlo")
		expect(readEnv(tanstack.env ?? {}, "baseUrl")).toBe("https://tanstack.example/api/kizlo")
		expect(readEnv(nodeIntegration.env ?? {}, "baseUrl")).toBe("https://node.example/api/kizlo")
	})

	test("maps both WordPress connections without selecting one", () => {
		const integrations = [
			nextjs({ env: wordpress, revalidate: false }),
			astro({ env: wordpress }),
			tanstackStart({ env: wordpress }),
			node({ env: wordpress }),
		]

		for (const integration of integrations) {
			expect(integration.env).toMatchObject({
				mode: "remote",
				remote: {
					siteSecret: "remote-secret",
					wordpressUrl: "https://wp.example",
					wordpressUsername: "admin",
					wordpressPassword: "password",
				},
				local: {
					siteSecret: "local-secret",
					wordpressUrl: "http://localhost:8080",
					wordpressUsername: "local-admin",
					wordpressPassword: "local-password",
				},
			})
			expect(readEnv(integration.env ?? {}, "remote.wordpressUrl")).toBe("https://wp.example")
			expect(readEnv(integration.env ?? {}, "local.wordpressUrl")).toBe("http://localhost:8080")
		}
	})

	test("runtime integrations only map the connection selector", () => {
		expect(node({ env: { KIZLO_MODE: "preview", NODE_ENV: "test" } }).env).toMatchObject({ mode: "preview" })
		expect(node({ env: { NODE_ENV: "test" } }).env).not.toHaveProperty("environment")
	})

	test("bundles Next.js revalidation unless disabled", () => {
		expect(nextjs({ env: {} }).events).toHaveLength(1)
		expect(nextjs({ env: {}, revalidate: false }).events).toBeUndefined()
	})
})
