import { type AnyRequestMiddleware, createMiddleware, createStart, flattenMiddlewares } from "@tanstack/react-start"
import { beforeEach, expect, test, vi } from "vitest"
import { type MiddlewareMatcher, matchMiddleware } from "./middleware"

const { getRequest } = vi.hoisted(() => ({ getRequest: vi.fn<() => Request>() }))
vi.mock("@tanstack/react-start/server", () => ({ getRequest }))

const middleware = createMiddleware().server(({ next }) => next({ context: { userId: "alice" } }))
beforeEach(() => getRequest.mockReset())

test.each<[MiddlewareMatcher, string, boolean]>([
	["/", "/", true],
	["/", "/account", false],
	["/privacy", "/privacy/", true],
	["/privacy", "/privacy?preview=true#top", true],
	["/privacy", "/privacy-policy", false],
	["/products/:slug", "/products/shirt", true],
	["/products/:slug", "/products/shirt/reviews", false],
	["/products/:path*", "/products", true],
	["/products/:path*", "/products/shirt/reviews", true],
	["/checkout(.*)", "/checkout", true],
	["/checkout(.*)", "/checkout/payment", true],
	["/checkout(.*)", "/checkout-extra", true],
	["/api/(.*)", "/api/orders/23", true],
	["/api/(.*)", "/apis/orders", false],
	["/orders(.*)", "/Orders/23", true],
	["/feed.json", "/feedXjson", false],
	[["/privacy", "/orders(.*)", "/sign-in(.*)"], "/orders/23", true],
	[["/privacy", "/orders(.*)", "/sign-in(.*)"], "/products/shirt", false],
	[[], "/", false],
	["/((?!products(?:/|$)|collections(?:/|$)|$).*)", "/products/shirt", false],
	["/((?!products(?:/|$)|collections(?:/|$)|$).*)", "/", false],
	["/((?!products(?:/|$)|collections(?:/|$)|$).*)", "/account", true],
])("matches %j against %s: %s", (matcher, path, expected) => {
	const wrapped = matchMiddleware(middleware, matcher)
	getRequest.mockReturnValue(new Request(`https://shop.example${path}`))
	expect(flattenMiddlewares<AnyRequestMiddleware>([wrapped]).includes(middleware)).toBe(expected)
})

test("predicates receive the original request once per request and can inspect headers and query strings", () => {
	const request = new Request("https://shop.example/catalog?preview=true", { headers: { "x-preview": "yes" } })
	getRequest.mockReturnValue(request)
	const matcher = vi.fn(
		(incoming: Request) => incoming.headers.get("x-preview") === "yes" && new URL(incoming.url).searchParams.has("preview"),
	)
	const wrapped = matchMiddleware(middleware, matcher)
	expect(flattenMiddlewares<AnyRequestMiddleware>([wrapped]).includes(middleware)).toBe(true)
	expect(flattenMiddlewares<AnyRequestMiddleware>([wrapped]).includes(middleware)).toBe(true)
	expect(matcher).toHaveBeenCalledExactlyOnceWith(request)
	getRequest.mockReturnValue(new Request("https://shop.example/catalog"))
	expect(flattenMiddlewares<AnyRequestMiddleware>([wrapped]).includes(middleware)).toBe(false)
	expect(matcher).toHaveBeenCalledTimes(2)
})

test("works directly in requestMiddleware and conditionally includes native dependencies without duplicating them", async () => {
	const dependency = createMiddleware().server(({ next }) => next())
	const authentication = createMiddleware()
		.middleware([dependency])
		.server(({ next }) => next())
	// Registration can happen outside a request; selection happens when Start flattens the chain.
	const wrapped = matchMiddleware(authentication, ["/account(.*)", "/_serverFn/(.*)"])
	const start = createStart(() => ({ requestMiddleware: [middleware, wrapped, wrapped] }))
	const selected = (await start.getOptions()).requestMiddleware ?? []
	getRequest.mockReturnValue(new Request("https://shop.example/"))
	expect(wrapped.options.server).toBeTypeOf("function")
	expect(flattenMiddlewares<AnyRequestMiddleware>([...selected]).filter((entry) => entry !== wrapped && entry.options.server)).toEqual([
		middleware,
	])
	getRequest.mockReturnValue(new Request("https://shop.example/account"))
	expect(flattenMiddlewares<AnyRequestMiddleware>([...selected]).filter((entry) => entry !== wrapped && entry.options.server)).toEqual([
		middleware,
		dependency,
		authentication,
	])
	getRequest.mockReturnValue(new Request("https://shop.example/_serverFn/private"))
	expect(flattenMiddlewares<AnyRequestMiddleware>([...selected]).includes(authentication)).toBe(true)
})

test.each(["account(.*)", "/account(", "/products/**"])("rejects an invalid path pattern: %s", (matcher) => {
	expect(() => matchMiddleware(middleware, matcher)).toThrow()
})

test("rejects asynchronous predicates", () => {
	getRequest.mockReturnValue(new Request("https://shop.example/"))
	// @ts-expect-error request predicates must return a boolean, not a Promise
	const wrapped = matchMiddleware(middleware, async () => true)
	expect(() => flattenMiddlewares<AnyRequestMiddleware>([wrapped])).toThrow("synchronously")
})
