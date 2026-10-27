import { type AuthGetSession, createIntegration, Kizlo } from "kizlo"
import { afterEach, expect, test, vi } from "vitest"
import { introspection } from "../../../../introspection"
import { woocommerce } from "../index"

const EMAIL = "owner@example.com"

function instance(getSession: AuthGetSession = () => ({ id: "auth-provider-id", email: EMAIL }), status = 200) {
	const downstream = vi.fn<typeof fetch>(async () =>
		Response.json(status === 200 ? [] : { code: "kizlo_order_history_forbidden", message: "Backend error", data: { status } }, {
			status,
			headers: {
				"x-wp-total": "0",
				"x-wp-totalpages": "0",
				"x-kizlo-version": "999.0.0",
				"x-kizlo-extensions": "kizlo-woocommerce=999.0.0",
			},
		}),
	)
	vi.stubGlobal("fetch", downstream)
	const api = new Kizlo({
		baseUrl: "https://app.example/api/kizlo",
		siteSecret: "test-secret",
		credentials: { url: "https://wp.example", username: "admin", password: "secret" },
		introspection,
		integrations: [createIntegration({ id: "auth", adapters: { auth: { getSession } } }), woocommerce()],
	})
	return { api, downstream }
}

afterEach(() => vi.unstubAllGlobals())

test("list requires a customer session for HTTP and direct calls before contacting WordPress", async () => {
	const { api, downstream } = instance(() => null)
	await expect(api.client.woocommerce.orders.list.call()).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 })
	const response = await api.handler(new Request("https://app.example/api/kizlo/orders?customer=123&email=owner@example.com"))
	expect(response.status).toBe(401)
	expect(response.headers.get("cache-control")).toBe("private, no-store")
	expect(downstream).not.toHaveBeenCalled()
})

test("list forwards the adapter identity and pagination and returns standard empty metadata", async () => {
	const { api, downstream } = instance()
	const result = await api.client.woocommerce.orders.list.call({ query: { page: "2", perPage: "3" } })
	expect(result.items).toEqual([])
	expect(result.meta).toMatchObject({ page: 2, totalItems: 0, totalPages: 0, nextPage: null, hasNextPage: false })
	const [url, init] = downstream.mock.calls[0] ?? []
	expect(String(url)).toContain("/wp-json/kizlo/v1/woocommerce/orders?")
	expect(new URL(String(url)).searchParams.get("page")).toBe("2")
	expect(new URL(String(url)).searchParams.get("per_page")).toBe("3")
	expect(new Headers(init?.headers).get("x-kizlo-user-email")).toBe(EMAIL)
	expect(new Headers(init?.headers).get("x-kizlo-guest-token")).toBeNull()
})

test("HTTP history ignores caller owner selectors and cannot be shared-cached", async () => {
	const { api, downstream } = instance()
	const response = await api.handler(new Request("https://app.example/api/kizlo/orders?customer=123&email=other@example.com"))
	expect(response.status).toBe(200)
	expect(response.headers.get("cache-control")).toBe("private, no-store")
	const [url, init] = downstream.mock.calls[0] ?? []
	expect(new URL(String(url)).searchParams.has("customer")).toBe(false)
	expect(new URL(String(url)).searchParams.has("email")).toBe(false)
	expect(new Headers(init?.headers).get("x-kizlo-user-email")).toBe(EMAIL)
})

test.each(["page=0", "page=1.5", "perPage=101", "perPage=-1"])("rejects invalid pagination %s", async (query) => {
	const { api, downstream } = instance()
	const response = await api.handler(new Request(`https://app.example/api/kizlo/orders?${query}`))
	expect(response.status).toBe(400)
	expect(response.headers.get("cache-control")).toBe("private, no-store")
	expect(downstream).not.toHaveBeenCalled()
})

test.each([
	[401, "UNAUTHORIZED"],
	[403, "FORBIDDEN"],
	[400, "BAD_REQUEST"],
	[500, "INTERNAL_SERVER_ERROR"],
] as const)("preserves backend failure %i as %s with private HTTP headers", async (status, code) => {
	const { api } = instance(undefined, status)
	await expect(api.client.woocommerce.orders.list.call()).rejects.toMatchObject({ code, status })
	const response = await api.handler(new Request("https://app.example/api/kizlo/orders"))
	expect(response.status).toBe(status)
	expect(response.headers.get("cache-control")).toBe("private, no-store")
})
