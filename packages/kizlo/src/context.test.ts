import { pluginUpdateMessage } from "@kizlo/shared"
import { afterEach, describe, expect, test, vi } from "vitest"
import { Context, type ContextConfig } from "./context"

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function createContext(url: string, overrides: Partial<ContextConfig> = {}): Context {
	return new Context({
		siteSecret: "secret",
		credentials: { url, username: "admin", password: "password" },
		...overrides,
	})
}

function request(context: Context, path = "wp-json/kizlo/v1/settings") {
	return context.createServerContext().wordpress.get(path, {})
}

afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

describe("WordPress setup warnings", () => {
	test("deduplicates the same connection warning across isolated module instances", async () => {
		vi.stubGlobal("fetch", vi.fn<FetchFn>().mockRejectedValue(new Error("fetch failed")))
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
		const { Context: FirstContext } = await import("./context")
		vi.resetModules()
		const { Context: SecondContext } = await import("./context")
		const config = {
			siteSecret: "secret",
			credentials: { url: "https://bundled-twice.example", username: "admin", password: "password" },
		}

		await Promise.all([request(new FirstContext(config)), request(new SecondContext(config))])

		expect(warn).toHaveBeenCalledTimes(1)
	})

	test("names an unreachable request once per process without blaming the plugin", async () => {
		vi.stubGlobal("fetch", vi.fn<FetchFn>().mockRejectedValue(new Error("fetch failed")))
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
		const first = createContext("https://missing.example", {
			extensionPlugins: [{ slug: "kizlo-woocommerce", name: "Kizlo WooCommerce", version: "0.2.0" }],
		})
		const second = createContext("https://missing.example")

		await Promise.all([
			request(first),
			request(second, "wp-json/kizlo/v1/post-types/post"),
			request(first, "wp-json/kizlo/v1/seo/homepage"),
		])

		expect(warn).toHaveBeenCalledTimes(1)
		const message = String(warn.mock.calls[0]?.[0])
		expect(message).toContain("Nothing answered the WordPress request to https://missing.example/wp-json/kizlo/v1/settings")
		expect(message).not.toContain("plugin outdated")
		expect(message).not.toContain("Kizlo WooCommerce")
	})

	test("distinguishes an unrelated HTTP response from an outdated plugin", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn<FetchFn>().mockResolvedValue(new Response("<html>Not found</html>", { status: 404, headers: { "content-type": "text/html" } })),
		)
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

		await request(createContext("https://other-server.example"))

		expect(warn).toHaveBeenCalledTimes(1)
		const message = String(warn.mock.calls[0]?.[0])
		expect(message).toContain("The response from https://other-server.example/wp-json/kizlo/v1/settings")
		expect(message).toContain("did not identify a Kizlo WordPress plugin")
		expect(message).not.toContain("plugin outdated")
	})

	test("reports an old plugin version and the required minimum once", async () => {
		vi.stubGlobal("fetch", vi.fn<FetchFn>().mockResolvedValue(Response.json({}, { headers: { "x-kizlo-version": "0.7.0" } })))
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
		const context = createContext("https://old-wordpress.example")

		await Promise.all([request(context), request(context)])

		expect(warn).toHaveBeenCalledTimes(1)
		expect(String(warn.mock.calls[0]?.[0])).toContain(pluginUpdateMessage("0.7.0"))
	})
})

describe("REST cookie storage", () => {
	function restContext(cookieHeader?: string) {
		const headers = cookieHeader ? { cookie: cookieHeader } : undefined
		return createContext("https://cookies.example").createRestContext(new Request("https://app.example", { headers }))
	}

	function sentCookieHeader(headers: Headers): string {
		return headers
			.getSetCookie()
			.map((header) => header.split(";")[0])
			.join("; ")
	}

	test("round-trips a value holding characters the writer percent-encodes", async () => {
		const value = "Jeff & Sons, Ltd."
		const writer = restContext()

		await writer.cookies.set({ name: "kizlo_display", value })
		const wire = sentCookieHeader(writer.headers)

		expect(wire).toBe("kizlo_display=Jeff%20%26%20Sons%2C%20Ltd.")
		await expect(restContext(wire).cookies.get("kizlo_display")).resolves.toBe(value)
	})

	test("leaves a token-style value untouched in both directions", async () => {
		const value = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0="
		const writer = restContext()

		await writer.cookies.set({ name: "kizlo_session", value })
		const wire = sentCookieHeader(writer.headers)

		expect(wire).toBe(`kizlo_session=${value}`)
		await expect(restContext(wire).cookies.get("kizlo_session")).resolves.toBe(value)
	})

	test("skips a pair carrying no value and keeps the first of a repeated name", async () => {
		const cookies = await restContext("stray; kizlo_session=first; kizlo_session=second").cookies.get()

		expect(cookies).toEqual([{ name: "kizlo_session", value: "first" }])
	})
})
