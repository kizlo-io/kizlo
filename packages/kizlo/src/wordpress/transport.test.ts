import { afterEach, describe, expect, test, vi } from "vitest"
import { createWordPressClient, wpEndpoint } from "./endpoint"
import { WordPressTransport } from "./transport"
import type { WP_EndpointDefinition, WP_Result } from "./types"

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const credentials = { url: "https://wp.example", username: "admin", password: "secret" }

/** Runs one definition the way a generated client does: an endpoint bound to a transport. */
function call<TData = unknown, TError extends string = never>(
	definition: WP_EndpointDefinition,
	input: Record<string, unknown>,
): Promise<WP_Result<TData, TError>> {
	const transport = new WordPressTransport({ credentials })
	const endpoint = wpEndpoint<Record<string, unknown>, WP_Result<TData, TError>>(definition)
	return createWordPressClient(transport, { run: endpoint }).run(input)
}

function definition(overrides: Partial<WP_EndpointDefinition> = {}): WP_EndpointDefinition {
	return {
		namespace: "kizlo/v1",
		path: "/books",
		method: "GET",
		pathParameters: [],
		responseContentTypes: { "200": "application/json" },
		...overrides,
	}
}

afterEach(() => vi.unstubAllGlobals())

describe("generated endpoints", () => {
	test("substitutes encoded path input and sends the remainder as GET query", async () => {
		const fetch = vi.fn<FetchFn>(async () => Response.json({ id: 1 }))
		vi.stubGlobal("fetch", fetch)
		const result = await call<{ id: number }>(definition({ path: "/books/{identifier}", pathParameters: ["identifier"] }), {
			identifier: "dune messiah",
			page: 2,
		})

		expect(result.data).toEqual({ id: 1 })
		const [url, init] = fetch.mock.calls[0] ?? []
		const headers = init?.headers as Record<string, string> | undefined
		expect(url).toBe("https://wp.example/wp-json/kizlo/v1/books/dune%20messiah?page=2")
		expect(init?.method).toBe("GET")
		expect(headers?.authorization).toMatch(/^Basic /)
	})

	/**
	 * The transport used to append `context=edit` to every request, from back when it only spoke to
	 * `wp/v2` and `kizlo/v1`. It now carries whatever the described route declares and nothing else:
	 * the routes Kizlo serves pin the context server side, and the routes it only describes are
	 * described in the context WordPress falls back to. A Store API cart call is where the old rule
	 * was most obviously wrong, and it is the case with no query string to hide behind.
	 */
	test("sends only the query the caller gave it, on any namespace", async () => {
		const fetch = vi.fn<FetchFn>(async () => Response.json({ items: [] }))
		vi.stubGlobal("fetch", fetch)

		await call(definition({ namespace: "wc/store/v1", path: "/cart" }), {})

		expect(fetch.mock.calls[0]?.[0]).toBe("https://wp.example/wp-json/wc/store/v1/cart")
	})

	/** The escape hatch an integration reaches for, so a context it asks for by hand still arrives. */
	test("carries a context the caller asked for", async () => {
		const fetch = vi.fn<FetchFn>(async () => Response.json({ id: 1 }))
		vi.stubGlobal("fetch", fetch)

		await call(definition(), { context: "edit" })

		expect(fetch.mock.calls[0]?.[0]).toBe("https://wp.example/wp-json/kizlo/v1/books?context=edit")
	})

	test("partitions path input from a JSON request body", async () => {
		const fetch = vi.fn<FetchFn>(async () => Response.json({ ok: true }, { status: 201 }))
		vi.stubGlobal("fetch", fetch)
		await call(
			definition({
				path: "/books/{id}",
				method: "POST",
				pathParameters: ["id"],
				requestContentType: "application/json",
				responseContentTypes: { "201": "application/json" },
			}),
			{ id: 7, title: "Dune" },
		)

		const [url, init] = fetch.mock.calls[0] ?? []
		const headers = init?.headers as Record<string, string> | undefined
		expect(url).toBe("https://wp.example/wp-json/kizlo/v1/books/7")
		expect(init?.body).toBe('{"title":"Dune"}')
		expect(headers?.["Content-Type"]).toBe("application/json")
	})

	test("serializes multipart and URL-encoded request bodies", async () => {
		const fetch = vi.fn<FetchFn>(async () => Response.json({ ok: true }))
		vi.stubGlobal("fetch", fetch)
		await call(definition({ method: "POST", requestContentType: "multipart/form-data" }), {
			title: "Dune",
			cover: new Blob(["cover"]),
			tags: ["sci-fi", "classic"],
		})
		const multipart = fetch.mock.calls[0]?.[1]?.body
		const multipartHeaders = fetch.mock.calls[0]?.[1]?.headers as Record<string, string> | undefined
		expect(multipart).toBeInstanceOf(FormData)
		expect([...(multipart as FormData).keys()]).toEqual(["title", "cover", "tags[0]", "tags[1]"])
		expect(multipartHeaders?.["Content-Type"]).toBeUndefined()

		await call(definition({ method: "PATCH", requestContentType: "application/x-www-form-urlencoded" }), {
			title: "Dune",
			tags: ["sci-fi", "classic"],
		})
		expect(String(fetch.mock.calls[1]?.[1]?.body)).toBe("title=Dune&tags=sci-fi%2Cclassic")
		const urlEncodedHeaders = fetch.mock.calls[1]?.[1]?.headers as Record<string, string> | undefined
		expect(urlEncodedHeaders?.["Content-Type"]).toBe("application/x-www-form-urlencoded")
	})

	test("parses declared JSON, text, binary, empty, and WordPress error responses", async () => {
		const fetch = vi
			.fn<FetchFn>()
			.mockResolvedValueOnce(Response.json({ id: 1 }))
			.mockResolvedValueOnce(new Response("plain", { headers: { "content-type": "text/plain" } }))
			.mockResolvedValueOnce(new Response(new Uint8Array([1, 2]), { headers: { "content-type": "application/octet-stream" } }))
			.mockResolvedValueOnce(new Response(null, { status: 204 }))
			.mockResolvedValueOnce(Response.json({ code: "invalid_book", message: "No book" }, { status: 400 }))
		vi.stubGlobal("fetch", fetch)
		expect((await call<{ id: number }>(definition(), {})).data).toEqual({ id: 1 })
		expect((await call<string>(definition({ responseContentTypes: { "200": "text/plain" } }), {})).data).toBe("plain")
		expect((await call<Blob>(definition({ responseContentTypes: { "200": "application/octet-stream" } }), {})).data).toBeInstanceOf(Blob)
		expect((await call<null>(definition({ responseContentTypes: { "204": undefined } }), {})).data).toBeNull()
		const failed = await call<never, "invalid_book">(definition({ responseContentTypes: { "400": "application/json" } }), {})
		expect(failed.error?.code).toBe("invalid_book")
		expect(failed.status).toBe(400)
	})

	/**
	 * Preparing a request can fail as readily as sending one, and a body that will not serialize is
	 * the reachable case: it is caller data. It reports as a transport failure rather than rejecting,
	 * so a caller branching on `response.error` never has to also wrap the call in a try.
	 */
	test("reports a request it cannot prepare rather than rejecting", async () => {
		const fetch = vi.fn<FetchFn>(async () => Response.json({ ok: true }))
		vi.stubGlobal("fetch", fetch)
		const circular: Record<string, unknown> = {}
		circular.self = circular

		const result = await call(definition({ method: "POST", requestContentType: "application/json" }), circular)

		expect(result.error?.code).toBe("unknown_error")
		expect(result.status).toBe(0)
		expect(fetch).not.toHaveBeenCalled()
	})
})
