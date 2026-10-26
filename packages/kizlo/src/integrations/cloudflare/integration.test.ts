import { AsyncLocalStorage } from "node:async_hooks"
import { afterEach, describe, expect, test, vi } from "vitest"
import { createIntegration, createProcedure, geoMock, Kizlo, schemaType } from "../../index"
import { nextjs } from "../nextjs/integration"
import { cloudflare, geoCloudflare, withCloudflareRequest } from "./index"

const { headers } = vi.hoisted(() => ({
	headers: vi.fn(() => {
		throw new Error("Must not read Next.js headers")
	}),
}))
vi.mock("next/headers", () => ({ headers }))

afterEach(() => {
	vi.clearAllMocks()
	vi.unstubAllGlobals()
})

function request(ip?: string) {
	return new Request("https://app.example/api/ip", { headers: ip ? { "cf-connecting-ip": ip } : {} })
}

const geo = geoCloudflare()
const ip = async () => (await geo.getConnInfo(null)).ip

describe("Cloudflare request context", () => {
	test("uses explicit requests before local context and never trusts generic forwarding headers", async () => {
		await withCloudflareRequest(request("203.0.113.1"), async () => {
			expect((await geo.getConnInfo(request("2001:db8::2"))).ip).toBe("2001:db8::2")
			expect(
				(
					await geo.getConnInfo(
						new Request("https://app.example", {
							headers: { "x-real-ip": "203.0.113.3", "x-forwarded-for": "203.0.113.4" },
						}),
					)
				).ip,
			).toBeNull()
			expect(await ip()).toBe("203.0.113.1")
			return new Response(null)
		})
		expect(headers).not.toHaveBeenCalled()
	})

	test("returns empty metadata outside a request and snapshots trusted headers at entry", async () => {
		expect(await geo.getConnInfo(null)).toEqual({
			ip: null,
			country: null,
			city: null,
			state: null,
			postcode: null,
			timezone: null,
			userAgent: null,
		})
		const incoming = request("203.0.113.1")
		incoming.headers.set("cf-ipcountry", "IN")
		incoming.headers.set("user-agent", "visitor")
		await withCloudflareRequest(incoming, async () => {
			incoming.headers.set("cf-connecting-ip", "203.0.113.2")
			expect(await geo.getConnInfo(null)).toMatchObject({ ip: "203.0.113.1", country: "IN", userAgent: "visitor" })
			const connection = await geo.getConnInfo(null)
			connection.ip = "203.0.113.9"
			expect(await ip()).toBe("203.0.113.1")
			return new Response(null)
		})
		expect(await ip()).toBeNull()
		expect(headers).not.toHaveBeenCalled()
	})

	test("isolates overlapping visitors, nested requests, and async continuations", async () => {
		let release!: () => void
		const gate = new Promise<void>((resolve) => {
			release = resolve
		})
		const first = withCloudflareRequest(request("203.0.113.1"), async () => {
			await gate
			expect(await ip()).toBe("203.0.113.1")
			await withCloudflareRequest(request("203.0.113.3"), async () => {
				await Promise.resolve()
				expect(await ip()).toBe("203.0.113.3")
				return new Response(null)
			})
			expect(await ip()).toBe("203.0.113.1")
			return new Response(null)
		})
		await withCloudflareRequest(request("2001:db8::2"), async () => {
			release()
			await first
			expect(await ip()).toBe("2001:db8::2")
			return new Response(null)
		})
		expect(await ip()).toBeNull()
	})

	test("clears inherited context after completion or handler failure", async () => {
		let later!: () => Promise<string | null>
		await withCloudflareRequest(request("203.0.113.1"), () => {
			later = AsyncLocalStorage.bind(ip)
			return new Response(null)
		})
		expect(await later()).toBeNull()
		await expect(
			withCloudflareRequest(request("203.0.113.2"), () => {
				later = AsyncLocalStorage.bind(ip)
				throw new Error("handler failed")
			}),
		).rejects.toThrow("handler failed")
		expect(await later()).toBeNull()
		expect(await ip()).toBeNull()
	})

	test("binds deferred stream pulls to their visitor and clears context when consumed", async () => {
		const later: (() => Promise<string | null>)[] = []
		const responses = await Promise.all(
			["203.0.113.1", "2001:db8::2"].map((address) =>
				withCloudflareRequest(request(address), () => {
					later.push(AsyncLocalStorage.bind(ip))
					let chunks = 0
					return new Response(
						new ReadableStream(
							{
								async pull(controller) {
									await Promise.resolve()
									controller.enqueue(new TextEncoder().encode((await ip()) ?? "missing"))
									if (++chunks === 2) controller.close()
								},
							},
							{ highWaterMark: 0 },
						),
					)
				}),
			),
		)
		expect(await ip()).toBeNull()
		expect(await Promise.all(responses.map((response) => response.text()))).toEqual(["203.0.113.1203.0.113.1", "2001:db8::22001:db8::2"])
		expect(await Promise.all(later.map((read) => read()))).toEqual([null, null])
	})

	test.each(["cancel", "error"])("clears context and propagates stream %s", async (mode) => {
		let later!: () => Promise<string | null>
		const cancel = vi.fn(async () => {
			expect(await ip()).toBe("203.0.113.1")
		})
		const response = await withCloudflareRequest(request("203.0.113.1"), () => {
			later = AsyncLocalStorage.bind(ip)
			return new Response(
				new ReadableStream(
					{
						pull() {
							throw new Error("stream failed")
						},
						cancel,
					},
					{ highWaterMark: 0 },
				),
			)
		})
		if (mode === "cancel") {
			await response.body?.cancel("disconnected")
			expect(cancel).toHaveBeenCalledWith("disconnected")
		} else await expect(response.text()).rejects.toThrow("stream failed")
		expect(await later()).toBeNull()
	})

	test.each(["public, max-age=60", "private, no-store"])("preserves %s response policy and cookies", async (policy) => {
		const response = await withCloudflareRequest(
			request("203.0.113.1"),
			() =>
				new Response("content", {
					status: 203,
					statusText: "Custom",
					headers: [
						["cache-control", policy],
						["set-cookie", "a=1; HttpOnly"],
						["set-cookie", "b=2; HttpOnly"],
					],
				}),
		)
		expect(response.status).toBe(203)
		expect(response.statusText).toBe("Custom")
		expect(response.headers.get("cache-control")).toBe(policy)
		expect(response.headers.getSetCookie()).toEqual(["a=1; HttpOnly", "b=2; HttpOnly"])
		expect(await response.text()).toBe("content")
		expect(headers).not.toHaveBeenCalled()
	})
})

describe("Cloudflare composition and transport", () => {
	const config = {
		baseUrl: "https://app.example/api",
		siteSecret: "secret",
		credentials: { url: "https://wp.example", username: "admin", password: "secret" },
	}

	test("allows application geo overrides in either array order", async () => {
		const app = createIntegration({ id: "app", adapters: { geo: geoMock({ ip: null }) } })
		for (const integrations of [
			[cloudflare(), app],
			[app, cloudflare()],
		]) {
			const server = new Kizlo({
				...config,
				integrations: [
					...integrations,
					createIntegration({
						id: "probe",
						procedures: {
							ip: createProcedure(
								{ scope: "internal", output: schemaType<string | null | undefined>() },
								async ({ context }) => (await context.getConnInfo())?.ip,
							),
						},
					}),
				] as const,
			})
			await withCloudflareRequest(request("203.0.113.1"), async () => {
				expect(await server.client.probe?.ip.call()).toBeNull()
				return new Response(null)
			})
		}
		expect(nextjs({ env: {}, revalidate: false }).adapters?.geo).toBeUndefined()
	})

	test("forwards isolated SSR and API IPs without Next.js headers or a global fetch patch", async () => {
		const fetch = vi.fn(async (_url: unknown, init?: RequestInit) =>
			Response.json(
				{ ip: new Headers(init?.headers).get("x-real-ip") },
				{
					headers: { "x-kizlo-version": "999.0.0" },
				},
			),
		)
		vi.stubGlobal("fetch", fetch)
		const server = new Kizlo({
			...config,
			integrations: [
				nextjs({ env: {}, revalidate: false }),
				cloudflare(),
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
		for (const mode of ["server", "api"] as const) {
			await Promise.all(
				["203.0.113.1", "2001:db8::2"].map(async (address) => {
					const incoming = request(address)
					const response = await withCloudflareRequest(incoming, async () => {
						await Promise.resolve()
						if (mode === "api") return server.handler(incoming)
						return Response.json((await server.client.probe?.ip())?.data)
					})
					expect(await response.json()).toEqual({ ip: address })
				}),
			)
		}
		for (const address of [undefined, "not-an-ip", "203.0.113.1, 203.0.113.2"]) {
			const response = await withCloudflareRequest(request(address), async () => Response.json((await server.client.probe?.ip())?.data))
			expect(await response.json()).toEqual({ ip: null })
		}
		expect((await server.client.probe?.ip())?.data).toEqual({ ip: null })
		expect(globalThis.fetch).toBe(fetch)
		expect(headers).not.toHaveBeenCalled()
	})
})
