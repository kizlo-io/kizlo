import { AsyncLocalStorage } from "node:async_hooks"
import { afterEach, describe, expect, test, vi } from "vitest"
import { createIntegration, createKizlo, createProcedure, geoCloudflareNext, geoMock, geoVercelNext, schemaType } from "../../index"
import { nextjs } from "./integration"

const { headers } = vi.hoisted(() => ({ headers: vi.fn() }))
vi.mock("next/headers", () => ({ headers }))

afterEach(() => {
	vi.resetAllMocks()
	vi.unstubAllGlobals()
})

describe("trusted Cloudflare client IP", () => {
	test("does not read headers when disabled", () => {
		expect(nextjs().adapters?.geo).toBeUndefined()
		expect(headers).not.toHaveBeenCalled()
	})

	test("reads only CF-Connecting-IP from an HTTP request", async () => {
		const resolver = geoCloudflareNext().getConnInfo
		const request = new Request("https://app.example/api", {
			headers: { "cf-connecting-ip": "2001:db8::1", "x-real-ip": "spoofed", "x-forwarded-for": "spoofed" },
		})
		expect((await resolver(request)).ip).toBe("2001:db8::1")
		expect(
			(await resolver(new Request("https://app.example/api", { headers: { "x-real-ip": "spoofed", "x-forwarded-for": "spoofed" } }))).ip,
		).toBeNull()
		expect(headers).not.toHaveBeenCalled()
	})

	test("reads Next.js/vinext request-local headers for direct server calls", async () => {
		headers.mockResolvedValue(new Headers({ "cf-connecting-ip": "203.0.113.9" }))
		expect((await geoCloudflareNext().getConnInfo(null)).ip).toBe("203.0.113.9")
		headers.mockResolvedValue(new Headers({ "x-real-ip": "spoofed", "x-forwarded-for": "spoofed" }))
		expect((await geoCloudflareNext().getConnInfo(null)).ip).toBeNull()
	})

	test("omits IPs without request context, including build-time calls and jobs", async () => {
		headers.mockRejectedValue(new Error("headers was called outside a request scope"))
		expect((await geoCloudflareNext().getConnInfo(null)).ip).toBeNull()
	})

	test.each(["rest", "server"] as const)("forwards request-local IPs through %s procedure calls", async (mode) => {
		const requests = new AsyncLocalStorage<Headers>()
		headers.mockImplementation(async () => requests.getStore() ?? new Headers())
		const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
			Response.json(
				{
					ip: new Headers(init?.headers).get("x-real-ip"),
				},
				{ headers: { "x-kizlo-version": "999.0.0" } },
			),
		)
		vi.stubGlobal("fetch", fetch)
		const server = createKizlo({
			integrations: [
				nextjs({
					revalidate: false,
					env: {
						NEXT_PUBLIC_KIZLO_BASE_URL: "https://app.example/api",
						KIZLO_WP_URL: "https://wp.example",
						KIZLO_WP_USERNAME: "admin",
						KIZLO_WP_APP_PASSWORD: "secret",
						KIZLO_WP_SECRET: "secret",
					},
				}),
				createIntegration({ id: "cloudflare", adapters: { geo: geoCloudflareNext() } }),
				createIntegration({
					id: "probe",
					procedures: {
						ip: createProcedure(
							{ scope: "api", method: "GET", path: "/ip", output: schemaType<{ ip: string | null }>() },
							async ({ context }) => {
								const result = await context.wordpress.get<{ ip: string | null }>("wp-json/kizlo/v1/settings", {})
								if (result.error) throw result.error
								return result.data
							},
						),
					},
				}),
			] as const,
		})
		for (const ip of ["203.0.113.1", "2001:db8::2"]) {
			await requests.run(new Headers({ "cf-connecting-ip": ip }), async () => {
				if (mode === "rest") {
					const response = await server.handler(new Request("https://app.example/api/ip", { headers: { "cf-connecting-ip": ip } }))
					expect(response.status).toBe(200)
					expect(await response.json()).toEqual({ ip })
				} else {
					expect((await server.client.probe?.ip())?.data).toEqual({ ip })
				}
			})
		}
	})

	test("allows a later custom integration to supply the trusted resolver", async () => {
		const resolver = vi.fn(() => geoMock({ ip: null }).getConnInfo(null))
		const server = createKizlo({
			baseUrl: "https://app.example/api",
			siteSecret: "secret",
			integrations: [
				nextjs({
					revalidate: false,
					env: { KIZLO_WP_URL: "https://wp.example", KIZLO_WP_USERNAME: "admin", KIZLO_WP_APP_PASSWORD: "secret" },
				}),
				createIntegration({ id: "cloudflare", adapters: { geo: geoCloudflareNext() } }),
				createIntegration({ id: "trusted-ingress", adapters: { geo: { getConnInfo: resolver } } }),
			] as const,
		})
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({}, { headers: { "x-kizlo-version": "999.0.0" } })),
		)
		await server.context.createServerContext().wordpress.get("wp-json/kizlo/v1/settings", {})
		expect(resolver).toHaveBeenCalledWith(null)
		expect(headers).not.toHaveBeenCalled()
	})
})

describe("platform geo adapter request context", () => {
	test.each([geoCloudflareNext, geoVercelNext])("returns null connection fields without a request", async (createGeo) => {
		headers.mockRejectedValue(new Error("outside a request scope"))
		expect(await createGeo().getConnInfo(null)).toEqual({
			ip: null,
			country: null,
			city: null,
			state: null,
			postcode: null,
			timezone: null,
			userAgent: null,
		})
	})

	test("Cloudflare exposes available connection metadata", async () => {
		const request = new Request("https://app.example", {
			headers: { "cf-connecting-ip": "203.0.113.3", "cf-ipcountry": "IN", "user-agent": "visitor" },
		})
		expect(await geoCloudflareNext().getConnInfo(request)).toMatchObject({ ip: "203.0.113.3", country: "IN", userAgent: "visitor" })
	})

	test.each(["XX", "T1"])("Cloudflare treats special country code %s as unavailable", async (country) => {
		const values = new Headers({ "cf-connecting-ip": "203.0.113.3", "cf-ipcountry": country })
		const expected = { ip: "203.0.113.3", country: null }
		expect(await geoCloudflareNext().getConnInfo(new Request("https://app.example", { headers: values }))).toMatchObject(expected)
		headers.mockResolvedValue(values)
		expect(await geoCloudflareNext().getConnInfo(null)).toMatchObject(expected)
	})

	test("Vercel keeps its existing HTTP and direct server geo sources", async () => {
		const values = new Headers({
			"x-real-ip": "203.0.113.4",
			"x-vercel-ip-country": "US",
			"x-vercel-ip-city": "New%20York",
			"x-vercel-ip-timezone": "America%2FNew_York",
		})
		const expected = { ip: "203.0.113.4", country: "US", city: "New York", timezone: "America/New_York" }
		expect(await geoVercelNext().getConnInfo(new Request("https://app.example", { headers: values }))).toMatchObject(expected)
		headers.mockResolvedValue(values)
		expect(await geoVercelNext().getConnInfo(null)).toMatchObject(expected)
	})
})
