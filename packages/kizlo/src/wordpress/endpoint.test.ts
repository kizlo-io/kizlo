import { afterEach, describe, expect, test, vi } from "vitest"
import { buildWordPressRequest, createWordPressClient, wpEndpoint } from "./endpoint"
import { WordPressTransport } from "./transport"
import type { WP_EndpointDefinition } from "./types"

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const credentials = { url: "https://wp.example", username: "admin", password: "secret" }

const RETRIEVE: WP_EndpointDefinition = {
	namespace: "kizlo/v1",
	path: "/books/{identifier}",
	method: "GET",
	pathParameters: ["identifier"],
	responseContentTypes: { "200": "application/json" },
}

function client() {
	const transport = new WordPressTransport({ credentials })
	const endpoints = { books: { retrieve: wpEndpoint<{ identifier: string }, { data: unknown }>(RETRIEVE) } }
	return createWordPressClient(transport, endpoints)
}

afterEach(() => vi.unstubAllGlobals())

describe("wpEndpoint", () => {
	test("is the definition itself, with nothing about the connection bound", () => {
		// The type parameters are phantom, so the leaf stays the definition rather than wrapping it.
		expect(wpEndpoint<{ identifier: string }, never>(RETRIEVE)).toBe(RETRIEVE)
	})
})

describe("buildWordPressRequest", () => {
	test("interpolates path parameters and keeps the remainder as query", () => {
		expect(buildWordPressRequest(RETRIEVE, { identifier: "dune messiah", page: 2 })).toEqual({
			base: "/wp-json/kizlo/v1",
			path: "/books/dune%20messiah",
			method: "GET",
			searchParams: { page: 2 },
			responseContentTypes: { "200": "application/json" },
		})
	})

	test("names the path parameter an input is missing", () => {
		expect(() => buildWordPressRequest(RETRIEVE, {})).toThrow('Missing WordPress path parameter "identifier"')
	})
})

describe("createWordPressClient", () => {
	test("runs an endpoint through the transport", async () => {
		const fetch = vi.fn<FetchFn>(async () => Response.json({ id: 1 }))
		vi.stubGlobal("fetch", fetch)

		const result = await client().books.retrieve({ identifier: "dune" })

		expect(result).toMatchObject({ data: { id: 1 }, error: null })
		expect(fetch.mock.calls[0]?.[0]).toBe("https://wp.example/wp-json/kizlo/v1/books/dune?context=edit")
	})

	test("applies per-call options over the definition", async () => {
		const fetch = vi.fn<FetchFn>(async () => Response.json({ id: 1 }))
		vi.stubGlobal("fetch", fetch)
		const controller = new AbortController()

		await client().books.retrieve({ identifier: "dune" }, { signal: controller.signal })

		// The transport composes the caller's signal with its own timeout, so it governs without being it.
		const signal = fetch.mock.calls[0]?.[1]?.signal
		expect(signal?.aborted).toBe(false)
		controller.abort()
		expect(signal?.aborted).toBe(true)
	})

	test("falls through to transport methods the tree does not define", async () => {
		const fetch = vi.fn<FetchFn>(async () => Response.json({ ok: true }))
		vi.stubGlobal("fetch", fetch)
		const wordpress = client()

		await wordpress.get("/anything", { base: "/wp-json/wp/v2" })

		expect(fetch.mock.calls[0]?.[0]).toBe("https://wp.example/wp-json/wp/v2/anything?context=edit")
		// Reading a transport method off the proxy must not lose its receiver.
		expect(wordpress.resolveListMetadata({ page: 1, totalPages: 2, totalItems: 3 })).toMatchObject({ has_next_page: true })
	})

	test("memoizes every node so repeated access is stable", () => {
		const wordpress = client()

		expect(wordpress.books).toBe(wordpress.books)
		expect(wordpress.books.retrieve).toBe(wordpress.books.retrieve)
		expect(wordpress.get).toBe(wordpress.get)
	})

	test("reports what it carries, from the tree and the transport", () => {
		const wordpress = client()

		expect("books" in wordpress).toBe(true)
		expect("get" in wordpress).toBe(true)
		expect("nope" in wordpress).toBe(false)
	})
})
