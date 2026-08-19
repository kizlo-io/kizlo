import { afterEach, describe, expect, test, vi } from "vitest"
import { buildWordPressRequest, createWordPressClient, wpEndpoint } from "./endpoint"
import { WordPressTransport } from "./transport"
import type { WP_EndpointDefinition, WP_Result } from "./types"

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
	const endpoints = { books: { retrieve: wpEndpoint<{ identifier: string }, WP_Result<{ id: number }, "invalid_book">>(RETRIEVE) } }
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
			request: {
				base: "/wp-json/kizlo/v1",
				path: "/books/dune%20messiah",
				method: "GET",
				searchParams: { page: 2 },
				responseContentTypes: { "200": "application/json" },
			},
			error: null,
		})
	})

	/**
	 * Each of these interpolates into a URL that means something other than "this book": the two
	 * literals become `/books/undefined` and `/books/null`, and an empty segment leaves `/books/`,
	 * which is the collection route beside it. A symbol is here because `String()` throws on one,
	 * which is the last way the builder itself could have raised.
	 */
	test.each([
		["absent", {}],
		["undefined", { identifier: undefined }],
		["null", { identifier: null }],
		["an empty string", { identifier: "" }],
		["a boolean", { identifier: true }],
		["an object", { identifier: { id: 1 } }],
		["NaN", { identifier: Number.NaN }],
		["a symbol", { identifier: Symbol("dune") }],
	])("reports the parameter rather than throwing when it is %s", (_label, input) => {
		const built = buildWordPressRequest(RETRIEVE, input)

		expect(built.request).toBeNull()
		expect(built.error?.code).toBe("invalid_path_parameter")
		expect(built.error?.message).toContain('"identifier"')
	})

	test("interpolates a zero, which is a segment a route can be asked for", () => {
		expect(buildWordPressRequest(RETRIEVE, { identifier: 0 }).request?.path).toBe("/books/0")
	})
})

describe("createWordPressClient", () => {
	test("runs an endpoint through the transport", async () => {
		const fetch = vi.fn<FetchFn>(async () => Response.json({ id: 1 }))
		vi.stubGlobal("fetch", fetch)

		const result = await client().books.retrieve({ identifier: "dune" })

		expect(result).toMatchObject({ data: { id: 1 }, error: null })
		expect(fetch.mock.calls[0]?.[0]).toBe("https://wp.example/wp-json/kizlo/v1/books/dune")
	})

	test("resolves to a failure for an unusable path parameter, without reaching the network", async () => {
		const fetch = vi.fn<FetchFn>(async () => Response.json({ id: 1 }))
		vi.stubGlobal("fetch", fetch)

		// `undefined` is the case types do not catch: the field is there, so the call compiles.
		const result = await client().books.retrieve({ identifier: undefined as unknown as string })

		expect(result).toMatchObject({ data: null, status: 0 })
		expect(result.error?.code).toBe("invalid_path_parameter")
		expect(result.error?.message).toContain('"identifier"')
		expect(fetch).not.toHaveBeenCalled()
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

	test("sends per-call headers without letting them reach the request the definition owns", async () => {
		const fetch = vi.fn<FetchFn>(async () => Response.json({ id: 1 }))
		vi.stubGlobal("fetch", fetch)

		await client().books.retrieve({ identifier: "dune" }, { headers: { "X-Kizlo-Guest-Token": "t_1", "X-Kizlo-User-Id": "7" } })

		const sent = fetch.mock.calls[0]?.[1]?.headers as Record<string, string>
		expect(sent["X-Kizlo-Guest-Token"]).toBe("t_1")
		expect(sent["X-Kizlo-User-Id"]).toBe("7")
		// The headers ride along; the route they ride to is still the definition's.
		expect(fetch.mock.calls[0]?.[0]).toBe("https://wp.example/wp-json/kizlo/v1/books/dune")
	})

	test("falls through to transport methods the tree does not define", async () => {
		const fetch = vi.fn<FetchFn>(async () => Response.json({ ok: true }))
		vi.stubGlobal("fetch", fetch)
		const wordpress = client()

		await wordpress.get("/anything", { base: "/wp-json/wp/v2" })

		expect(fetch.mock.calls[0]?.[0]).toBe("https://wp.example/wp-json/wp/v2/anything")
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

/**
 * The tree describes whatever the connected installation serves, and Kizlo's own routers call fixed
 * paths into it, so a post type with API access switched off takes `postTypes.post` out from under
 * `post.list`. These resolve to a failure rather than throwing, which is how a request that never
 * left already reports itself.
 */
describe("an endpoint the tree does not have", () => {
	/** The generated tree is what types these paths, so a test reaching for an absent one has to say so. */
	const absent = () => client() as unknown as Record<string, any>

	test("resolves to a failure naming the operation that was called", async () => {
		const fetch = vi.fn<FetchFn>(async () => Response.json({ id: 1 }))
		vi.stubGlobal("fetch", fetch)

		const result = await absent().books.destroy({ identifier: "dune" })

		expect(result).toMatchObject({ data: null, status: 0 })
		expect(result.error.code).toBe("rest_no_route")
		expect(result.error.message).toContain('"books.destroy"')
		expect(result.error.message).toContain("kizlo generate")
		expect(fetch).not.toHaveBeenCalled()
	})

	test("keeps proxying through an absent branch, so the leaf still names the whole path", async () => {
		const result = await absent().postTypes.post.list({ status: ["publish"] })

		expect(result.error.code).toBe("rest_no_route")
		expect(result.error.message).toContain('"postTypes.post.list"')
	})

	test("stays absent to `in`, so a caller can branch on the subtree instead", () => {
		const wordpress = absent()

		expect("post" in wordpress.postTypes).toBe(false)
		expect("destroy" in wordpress.books).toBe(false)
	})

	test("is not a thenable, so awaiting a subtree cannot hang", async () => {
		// `then` reaching the promise machinery as a function that resolves rather than calls back
		// would never settle. It stays `undefined`, so the await resolves to the node itself.
		expect(typeof absent().postTypes.then).toBe("undefined")
		await expect(Promise.resolve(absent().postTypes)).resolves.toBeDefined()
	})

	test("leaves the transport reachable, which is the other thing an unknown key can be", async () => {
		const fetch = vi.fn<FetchFn>(async () => Response.json({ ok: true }))
		vi.stubGlobal("fetch", fetch)

		await absent().get("/anything", { base: "/wp-json/wp/v2" })

		expect(fetch.mock.calls[0]?.[0]).toBe("https://wp.example/wp-json/wp/v2/anything")
	})
})
