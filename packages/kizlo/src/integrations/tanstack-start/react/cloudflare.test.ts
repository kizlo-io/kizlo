import { expect, test, vi } from "vitest"
import { Kizlo } from "../../../kizlo"
import { createIntegration } from "../../../shared/integration"
import { createProcedure, schemaType } from "../../../shared/procedure"
import {
	type CloudflareCacheBinding,
	cloudflare,
	createCdnHeaders,
	geoCloudflare,
	purgeCache,
	revalidateTag,
	revalidateUrl,
	withCloudflare,
} from "../cloudflare"
import { tanstackStart } from "./integration"

const native = await vi.hoisted(async () => {
	const { AsyncLocalStorage } = await import("node:async_hooks")
	return {
		storage: new AsyncLocalStorage<{ request: Request; values: object }>(),
		getCookies: vi.fn(() => ({ cart: "guest" })),
		setCookie: vi.fn(),
		deleteCookie: vi.fn(),
	}
})
vi.mock("@tanstack/start-client-core", async (original) => ({
	...(await original<typeof import("@tanstack/start-client-core")>()),
	getGlobalStartContext: () => native.storage.getStore()?.values,
}))
vi.mock("@tanstack/start-server-core/request-response", () => ({
	getRequest: () => {
		const request = native.storage.getStore()?.request
		if (!request) throw new Error("No native Start request")
		return request
	},
}))
vi.mock("@tanstack/react-start/server", () => ({
	getCookies: native.getCookies,
	setCookie: native.setCookie,
	deleteCookie: native.deleteCookie,
}))

function invoke(request: Request, handle: () => Response | Promise<Response>, cache?: CloudflareCacheBinding) {
	const app = withCloudflare({
		fetch(
			request: Request,
			options: {
				context: { env: { SITE: string }; executionCtx: { cache?: CloudflareCacheBinding; waitUntil(p: Promise<unknown>): void } }
			},
		) {
			return native.storage.run({ request, values: options.context }, handle)
		},
	})
	return app.fetch(request, { SITE: new URL(request.url).host }, { cache, waitUntil: vi.fn() })
}
const request = (path = "/product/shirt", init?: RequestInit) => new Request(`https://shop.example${path}`, init)
const publicPage = () => new Response("page", { headers: createCdnHeaders({ maxAge: "1 hour", tags: ["product:23"] }) })
const binding = () => ({
	invalidate: vi.fn<NonNullable<CloudflareCacheBinding["invalidate"]>>(async () => ({ success: true })),
	purge: vi.fn<NonNullable<CloudflareCacheBinding["purge"]>>(async () => ({ success: true })),
})
const tags = (response: Response) => response.headers.get("Cache-Tag")?.split(",") ?? []

test("uses native Start context for concurrent direct server calls and HTTP calls", async () => {
	const server = new Kizlo({
		baseUrl: "https://shop.example/api",
		siteSecret: "secret",
		credentials: { url: "https://wp.example", username: "a", password: "b" },
		integrations: [
			tanstackStart({ env: {} }),
			cloudflare(),
			createIntegration({
				id: "probe",
				procedures: {
					info: createProcedure(
						{ scope: "api", method: "GET", path: "/info", output: schemaType<{ site: string | null; ip: string | null }>() },
						async ({ context }) => {
							await Promise.resolve()
							return {
								site: (context as typeof context & { env?: { SITE: string } }).env?.SITE ?? null,
								ip: (await context.getConnInfo())?.ip ?? null,
							}
						},
					),
				},
			}),
		],
	})
	const probe = server.client.probe
	if (!probe) throw new Error("Missing probe")
	await Promise.all(
		["first.example", "second.example"].map(async (host, index) => {
			const incoming = new Request(`https://${host}/api/info`, { headers: { "cf-connecting-ip": `203.0.113.${index + 1}` } })
			const response = await invoke(incoming, async () => {
				expect((await probe.info()).data).toEqual({ site: host, ip: `203.0.113.${index + 1}` })
				return server.handler(incoming)
			})
			expect(await response.json()).toEqual({ site: host, ip: `203.0.113.${index + 1}` })
		}),
	)
	expect((await probe.info()).data).toEqual({ site: null, ip: null })
	expect(cloudflare().adapters?.requestContext).toBeUndefined()
})

test("uses native Start cookie helpers and explicit request connection headers", async () => {
	const cookies = tanstackStart({ env: {} }).adapters?.cookies
	if (!cookies) throw new Error("Missing native cookies")
	expect(await cookies.getAll()).toEqual([{ name: "cart", value: "guest" }])
	await cookies.setAll([{ name: "cart", value: "new", options: { path: "/", httpOnly: true } }])
	await cookies.deleteAll([{ name: "cart", options: { path: "/" } }])
	expect(native.setCookie).toHaveBeenCalledWith("cart", "new", { path: "/", httpOnly: true })
	expect(native.deleteCookie).toHaveBeenCalledWith("cart", { path: "/" })
	expect(
		(await geoCloudflare().getConnInfo(new Request("https://shop.example", { headers: { "cf-connecting-ip": "2001:db8::1" } }))).ip,
	).toBe("2001:db8::1")
})

test("formats durations and rejects malformed durations and tags", () => {
	expect(createCdnHeaders({ maxAge: "1 hour", staleWhileRevalidate: "5 minutes", tags: ["catalog"] })).toEqual({
		"Cache-Control": "no-cache",
		"Cloudflare-CDN-Cache-Control": "public, max-age=3600, stale-while-revalidate=300, stale-if-error=0",
		"Cache-Tag": "catalog",
	})
	for (const maxAge of [-1, 0.1, NaN, Infinity]) expect(() => createCdnHeaders({ maxAge })).toThrow()
	// @ts-expect-error reject unsupported duration formats at runtime too
	expect(() => createCdnHeaders({ maxAge: "forever" })).toThrow()
	for (const tag of ["", "a,b", "two words", "line\nbreak", "trailing\n", "x".repeat(1025)])
		expect(() => createCdnHeaders({ maxAge: 60, tags: [tag] })).toThrow()
})

test("builds optional Vary headers without adding credential variance", () => {
	expect(createCdnHeaders({ maxAge: 60 })).not.toHaveProperty("Vary")
	expect(createCdnHeaders({ maxAge: 60, vary: [] })).not.toHaveProperty("Vary")
	expect(createCdnHeaders({ maxAge: 60, vary: ["Accept-Language", "Accept", "accept-language"] }).Vary).toBe("accept-language, Accept")
	expect(createCdnHeaders({ maxAge: 60, vary: ["Accept", "*"] }).Vary).toBe("*")
	for (const name of ["", "two words", "Accept, Cookie", "Accept\r\nCookie", "Accept\n", "Accept: value", "日本語"]) {
		expect(() => createCdnHeaders({ maxAge: 60, vary: [name] })).toThrow("HTTP header names")
	}
	// @ts-expect-error reject non-array values at runtime too
	expect(() => createCdnHeaders({ maxAge: 60, vary: "Accept" })).toThrow("HTTP header names")
	// @ts-expect-error reject non-string header names at runtime too
	expect(() => createCdnHeaders({ maxAge: 60, vary: [42] })).toThrow("HTTP header names")
})

test.each<{ headers: Record<string, string>; status: number }>([
	{ headers: { Cookie: "session=alice" }, status: 200 },
	{ headers: { Authorization: "Bearer private" }, status: 200 },
	{ headers: { "x-prerender-revalidate": "yes" }, status: 500 },
])("preserves explicit policies regardless of credentials and status: %j", async ({ headers, status }) => {
	const outgoing = new Response("page", {
		status,
		headers: { ...createCdnHeaders({ maxAge: 60 }), "Set-Cookie": "cart=guest", Vary: "Accept" },
	})
	const response = await invoke(request("/", { headers }), () => outgoing)
	expect(response.headers.get("Cloudflare-CDN-Cache-Control")).toContain("public, max-age=60")
	expect(response.headers.get("Cache-Control")).toBe("no-cache")
	expect(response.headers.get("Set-Cookie")).toBe("cart=guest")
	expect(response.headers.get("Vary")).toBe("Accept")
	await response.text()
})

test("defaults cart to no-store and leaves authored headers, streams and redirects intact", async () => {
	const response = await invoke(request("/cart"), () => new Response("dynamic"))
	expect(response.headers.get("Cache-Control")).toBe("no-store")
	expect(response.headers.has("Vary")).toBe(false)
	expect(await response.text()).toBe("dynamic")
	const redirect = await invoke(request(), () => Response.redirect("https://shop.example/sign-in"))
	expect(redirect.status).toBe(302)
	expect(redirect.headers.get("Location")).toBe("https://shop.example/sign-in")
	const explicit = await invoke(request(), () => new Response("private", { headers: { "Cache-Control": "private, max-age=60" } }))
	expect(explicit.headers.get("Cache-Control")).toBe("private, max-age=60")
	await explicit.body?.cancel()
})

test.each(["Cache-Control", "CDN-Cache-Control", "Cloudflare-CDN-Cache-Control"])(
	"preserves an authored %s policy without attaching page tags",
	async (name) => {
		const response = await invoke(request(), () => new Response("page", { headers: { [name]: "public, max-age=60" } }))
		expect(response.headers.get(name)).toBe("public, max-age=60")
		expect(response.headers.has("Cache-Tag")).toBe(false)
		await response.body?.cancel()
	},
)

test("revalidates native pathname prefixes without requiring a page tag", async () => {
	const response = await invoke(request("/collections?page=1"), () => new Response("page", { headers: createCdnHeaders({ maxAge: 60 }) }))
	expect(response.headers.has("Cache-Tag")).toBe(false)
	await response.body?.cancel()
	const cache = binding()
	await invoke(
		request("/api/admin"),
		async () => {
			for (const target of [
				"/collections",
				"https://shop.example/collections?page=2#top",
				new URL("https://shop.example/old/../collections?page=3"),
				"/collections?page=4#top",
			]) {
				await revalidateUrl(target)
			}
			expect(cache.invalidate.mock.calls.map(([targets]) => targets)).toEqual(
				Array.from({ length: 4 }, () => ({ pathPrefixes: ["/collections"] })),
			)
			await revalidateUrl("/")
			expect(cache.invalidate).toHaveBeenLastCalledWith({ pathPrefixes: ["/"] })
			return new Response(null)
		},
		cache,
	)
	await expect(revalidateUrl("/collections")).rejects.toThrow("TanStack Start request")
})

test("keeps explicit resource tags scoped to the request host", async () => {
	const first = await invoke(request("/collections"), publicPage)
	const other = await invoke(new Request("https://other.example/collections"), publicPage)
	expect(tags(first)).toHaveLength(1)
	const cache = binding()
	await invoke(
		request("/api/admin"),
		async () => {
			await revalidateTag("product:23")
			const resourceTags = cache.invalidate.mock.calls[0]?.[0].tags ?? []
			expect(resourceTags).toEqual(tags(first))
			expect(resourceTags.some((tag) => tags(other).includes(tag))).toBe(false)
			return new Response(null)
		},
		cache,
	)
	await Promise.all([first, other].map((response) => response.body?.cancel()))
	await expect(revalidateTag("catalog")).rejects.toThrow("TanStack Start request")
})

test("rejects malformed or foreign URLs and tags without calling the provider", async () => {
	const cache = binding()
	await invoke(
		request(),
		async () => {
			for (const url of [
				"",
				"collections",
				"//other.example",
				"https://other.example/collections",
				"http://shop.example/collections",
				"https://user:pass@shop.example/collections",
				"https://",
				"https:/shop.example/collections",
				"/bad\\path",
				"/bad\npath",
				" /collections",
				"javascript:alert(1)",
			]) {
				await expect(revalidateUrl(url)).rejects.toThrow()
			}
			for (const tag of ["", "a,b", "two words", "line\nbreak", "trailing\n", "x".repeat(1025)]) {
				await expect(revalidateTag(tag)).rejects.toThrow("CDN tags")
			}
			expect(cache.invalidate).not.toHaveBeenCalled()
			return new Response(null)
		},
		cache,
	)
})

test("reports missing cache capabilities and provider failures without falling back to purge", async () => {
	const purge = vi.fn()
	const unsupported = { invalidate: undefined, purge }
	await invoke(request(), async () => {
		await expect(revalidateUrl("/collections")).rejects.toThrow("executionCtx.cache")
		return new Response(null)
	})
	await invoke(
		request(),
		async () => {
			await expect(revalidateTag("catalog")).rejects.toThrow("cache.invalidate()")
			return new Response(null)
		},
		unsupported,
	)
	expect(purge).not.toHaveBeenCalled()
	const cache = binding()
	await invoke(
		request(),
		async () => {
			cache.invalidate.mockResolvedValueOnce({ success: false, errors: [{ code: 1, message: "denied" }] })
			await expect(revalidateTag("catalog")).rejects.toThrow("1: denied")
			cache.invalidate.mockResolvedValueOnce({ success: false })
			await expect(revalidateUrl("/collections")).rejects.toThrow("Cloudflare CDN revalidation failed")
			cache.invalidate.mockRejectedValueOnce(new Error("network failure"))
			await expect(revalidateTag("catalog")).rejects.toThrow("network failure")
			return new Response(null)
		},
		cache,
	)
})

test("purges the Worker cache and reports unsupported runtimes and provider failures", async () => {
	const cache = binding()
	await invoke(
		request(),
		async () => {
			await purgeCache()
			expect(cache.purge).toHaveBeenCalledExactlyOnceWith({ purgeEverything: true })
			expect(cache.invalidate).not.toHaveBeenCalled()
			cache.purge.mockResolvedValueOnce({ success: false, errors: [{ code: 1134, message: "rate limited" }] })
			await expect(purgeCache()).rejects.toThrow("1134: rate limited")
			cache.purge.mockRejectedValueOnce(new Error("network failure"))
			await expect(purgeCache()).rejects.toThrow("network failure")
			return new Response(null)
		},
		cache,
	)
	await invoke(
		request(),
		async () => {
			await expect(purgeCache()).rejects.toThrow("cache.purge()")
			return new Response(null)
		},
		{ invalidate: cache.invalidate },
	)
	await expect(purgeCache()).rejects.toThrow("TanStack Start request")
})

test.each([224, 225, 1001])("retains a whole encoded prefix for %i dependencies without changing policy", async (count) => {
	const warning = vi.spyOn(console, "warn").mockImplementation(() => {})
	const authored = Array.from({ length: count }, (_, id) => `term:${id}`)
	const response = await invoke(
		request("/large?secret=hidden"),
		() =>
			new Response("stream", {
				status: 201,
				headers: {
					...createCdnHeaders({ maxAge: 12, staleWhileRevalidate: 34, staleIfError: 56, tags: [...authored, "term:0"] }),
					Vary: "Accept",
				},
			}),
	)
	expect(tags(response)).toHaveLength(Math.min(count, 224))
	expect(response.headers.get("Cache-Tag")?.length).toBeLessThanOrEqual(16384)
	expect(response.headers.get("Cloudflare-CDN-Cache-Control")).toBe("public, max-age=12, stale-while-revalidate=34, stale-if-error=56")
	expect(response.headers.get("Vary")).toBe("Accept")
	expect(response.status).toBe(201)
	expect(await response.text()).toBe("stream")
	if (count > 224)
		expect(warning).toHaveBeenCalledExactlyOnceWith({
			code: "KIZLO_CDN_TAGS_TRIMMED",
			pathname: "/large",
			requested: count,
			retained: 224,
			dropped: count - 224,
			maxBytes: 16384,
			maxTags: 1000,
		})
	else expect(warning).not.toHaveBeenCalled()
	warning.mockRestore()
})

test("validates beyond the retained prefix and trims manual headers in caller order", async () => {
	const authored = Array.from({ length: 225 }, (_, id) => `tag:${id}`)
	expect(() => createCdnHeaders({ maxAge: 1, tags: [...authored, "bad tag"] })).toThrow()
	const warning = vi.spyOn(console, "warn").mockImplementation(() => {})
	const response = await invoke(
		request(),
		() => new Response(null, { headers: { "Cache-Tag": authored.join(","), "Cache-Control": "public, max-age=90" } }),
	)
	const first = await invoke(request(), () => new Response(null, { headers: createCdnHeaders({ maxAge: 90, tags: ["tag:0"] }) }))
	expect(tags(response)[0]).toBe(tags(first)[0])
	expect(response.headers.get("Cache-Control")).toBe("public, max-age=90")
	warning.mockRestore()
})
