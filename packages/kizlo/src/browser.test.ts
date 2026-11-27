import { afterEach, expect, test, vi } from "vitest"
import { createBrowserClient } from "./browser"
import { createServerClient } from "./server"
import { wpEndpoint } from "./wordpress/endpoint"
import type { WP_Result } from "./wordpress/types"

const endpoints = {
	posts: {
		list: wpEndpoint<{ query?: { page?: number } }, WP_Result<{ id: number }[], never>>({
			namespace: "wp/v2",
			path: "/posts",
			method: "GET",
			pathParameters: [],
			responseContentTypes: { "200": "application/json" },
		}),
	},
}

afterEach(() => vi.unstubAllGlobals())

test("a direct guest call needs only the WordPress URL and endpoint definitions", async () => {
	const fetch = vi.fn(async (_url: string, _init: RequestInit) => Response.json([{ id: 1 }]))
	vi.stubGlobal("fetch", fetch)
	const client = createBrowserClient({ url: "https://wp.example", endpoints })
	expect((await client.posts.list({ query: { page: 2 } })).data).toEqual([{ id: 1 }])
	expect(fetch.mock.calls[0]?.[0]).toBe("https://wp.example/wp-json/wp/v2/posts?page=2")
	expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).has("authorization")).toBe(false)
})

test("the current user token is resolved for each request", async () => {
	const fetch = vi.fn(async (_url: string, _init: RequestInit) => Response.json([]))
	vi.stubGlobal("fetch", fetch)
	const getToken = vi.fn().mockResolvedValueOnce("first.jwt.token").mockResolvedValueOnce("second.jwt.token")
	const client = createBrowserClient({ url: "https://wp.example", endpoints, getToken })
	await client.posts.list()
	await client.posts.list()
	expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get("authorization")).toBe("Bearer first.jwt.token")
	expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).get("authorization")).toBe("Bearer second.jwt.token")
})

test("a signed-out token getter overrides stale caller authorization", async () => {
	const fetch = vi.fn(async (_url: string, _init: RequestInit) => Response.json([]))
	vi.stubGlobal("fetch", fetch)
	const client = createBrowserClient({ url: "https://wp.example", endpoints, getToken: () => null })
	await client.posts.list({}, { headers: { Authorization: "Bearer previous.user.token" } })
	expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).has("authorization")).toBe(false)
})

test("a token lookup failure cannot silently become an anonymous request", async () => {
	const fetch = vi.fn()
	vi.stubGlobal("fetch", fetch)
	const client = createBrowserClient({
		url: "https://wp.example",
		endpoints,
		getToken: async () => {
			throw new Error("session unavailable")
		},
	})
	expect((await client.posts.list()).error).not.toBeNull()
	expect(fetch).not.toHaveBeenCalled()
})

test("cancellation interrupts a pending token lookup without sending a request", async () => {
	const fetch = vi.fn()
	vi.stubGlobal("fetch", fetch)
	const client = createBrowserClient({ url: "https://wp.example", endpoints, getToken: () => new Promise<null>(() => {}) })
	const controller = new AbortController()
	const result = client.posts.list({}, { signal: controller.signal })
	await Promise.resolve()
	controller.abort()
	expect((await result).error).not.toBeNull()
	expect(fetch).not.toHaveBeenCalled()
})

test("credentials are never sent to a different origin", async () => {
	const fetch = vi.fn()
	vi.stubGlobal("fetch", fetch)
	const client = createServerClient({ credentials: { url: "https://wp.example", username: "admin", password: "secret" }, endpoints })
	expect((await client.get("/posts", { base: "https://attacker.example" })).error).not.toBeNull()
	expect(fetch).not.toHaveBeenCalled()
})

test("a server client refuses browser construction", () => {
	vi.stubGlobal("window", {})
	expect(() =>
		createServerClient({ credentials: { url: "https://wp.example", username: "admin", password: "secret" }, endpoints }),
	).toThrow("server")
})

test("an empty generated module is an actionable setup failure", () => {
	expect(() => createBrowserClient({ url: "https://wp.example", endpoints: {} })).toThrow("kizlo generate")
})

test("cart proof is caller-owned, forwarded only to Store API sessions, and cleared on logout", async () => {
	let token: string | null = null
	const fetch = vi.fn(async (_url: string, _init: RequestInit) => Response.json([], { headers: { "Cart-Token": "native.signed.cart" } }))
	vi.stubGlobal("fetch", fetch)
	const client = createBrowserClient({
		url: "https://wp.example",
		endpoints,
		cartSession: {
			get: () => token,
			set: (next) => {
				token = next
			},
		},
	})
	await client.get("/cart", { base: "/wp-json/wc/store/v1" })
	expect(token).toBe("native.signed.cart")
	expect(fetch.mock.calls[0]?.[1]?.cache).toBe("no-store")
	await client.get("/cart", { base: "/wp-json/wc/store/v1" })
	expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).get("Cart-Token")).toBe(token)
	await client.posts.list()
	expect(new Headers(fetch.mock.calls[2]?.[1]?.headers).has("Cart-Token")).toBe(false)
	token = null
	await client.get("/cart", { base: "/wp-json/wc/store/v1" })
	expect(new Headers(fetch.mock.calls[3]?.[1]?.headers).has("Cart-Token")).toBe(false)
})

test("direct user requests omit cookies and refuse redirects and shared caching", async () => {
	const fetch = vi.fn(async (_url: string, _init: RequestInit) => Response.json([]))
	vi.stubGlobal("fetch", fetch)
	const client = createBrowserClient({ url: "https://wp.example", endpoints, getToken: () => "signed.user.jwt" })
	await client.posts.list()
	expect(fetch.mock.calls[0]?.[1]).toMatchObject({ credentials: "omit", redirect: "error", cache: "no-store" })
})
