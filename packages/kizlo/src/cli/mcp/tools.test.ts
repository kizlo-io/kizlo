import { afterEach, describe, expect, it, vi } from "vitest"
import type { IntrospectionDocument } from "../../wordpress/introspection"
import { INTROSPECTION_FIXTURE } from "../../wordpress/introspection.fixture"
import type { SearchEvidence, SearchMatch } from "./search"
import type { McpState } from "./state"
import { callRoute, describeRoute, searchRoutes, type ToolResult } from "./tools"

const credentials = { url: "https://wp.example", username: "admin", password: "secret" }

function stateWith(document: IntrospectionDocument = INTROSPECTION_FIXTURE): McpState {
	return { document, credentials }
}

/** Answer every request with one JSON body, and report what was asked for. */
function captureFetch(body: unknown = { ok: true }, status = 200) {
	const calls: { url: string; method: string; body?: string }[] = []
	const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
		calls.push({
			url: String(input),
			method: init?.method ?? "GET",
			...(typeof init?.body === "string" ? { body: init.body } : {}),
		})
		return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
	})
	vi.stubGlobal("fetch", fetchMock)
	return calls
}

function value(result: ToolResult): Record<string, unknown> {
	if (!result.ok) throw new Error(result.error.message)
	return result.value as Record<string, unknown>
}

function found(result: ToolResult): { count: number; routes: SearchMatch[]; nextCursor?: string; namespaces: string[]; message?: string } {
	return value(result) as never
}

function names(result: ToolResult): string[] {
	return found(result).routes.map((route) => route.name)
}

function fieldsOf(match: SearchMatch | undefined): string[] {
	return (match?.evidence ?? []).map((item: SearchEvidence) => item.field)
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe("searchRoutes", () => {
	it("finds a route by its exact name, and says the name is why", () => {
		const outcome = found(searchRoutes(stateWith(), { query: "postTypes.book.retrieve" }))

		expect(outcome.routes[0]?.name).toBe("postTypes.book.retrieve")
		expect(outcome.routes[0]?.evidence).toContainEqual({ field: "route", term: "postTypes.book.retrieve" })
	})

	it("finds a route by its exact path", () => {
		const outcome = found(searchRoutes(stateWith(), { query: "/shipping/zones/{zone_id}/locations" }))

		expect(outcome.routes[0]?.name).toBe("shipping.zoneLocations.update")
		expect(outcome.routes[0]?.evidence).toContainEqual({ field: "path", term: "/shipping/zones/{zone_id}/locations" })
	})

	it("finds every route in a namespace named exactly", () => {
		const outcome = found(searchRoutes(stateWith(), { query: "wc/v3" }))

		expect(outcome.routes[0]?.name).toBe("shipping.zoneLocations.update")
		expect(outcome.routes[0]?.evidence).toContainEqual({ field: "namespace", term: "wc/v3" })
	})

	it("finds a route by a field in its request body", () => {
		const match = found(searchRoutes(stateWith(), { query: "revision" })).routes.find(
			(route) => route.name === "postTypes.book.restoreRevision",
		)

		expect(fieldsOf(match)).toContain("input.body.property")
	})

	it("finds a route by a field in its response", () => {
		const outcome = found(searchRoutes(stateWith(), { query: "publication" }))

		// `publication` is only ever a property of the book a route answers with.
		expect(outcome.count).toBeGreaterThan(0)
		expect(fieldsOf(outcome.routes[0])).toContain("response.property")
	})

	it("finds a route by a declared error code", () => {
		const match = found(searchRoutes(stateWith(), { query: "forbidden" })).routes.find((route) => route.name === "postTypes.book.list")

		expect(fieldsOf(match)).toContain("error")
	})

	it("finds a route by words in its summary", () => {
		const outcome = found(searchRoutes(stateWith(), { query: "replace" }))

		expect(outcome.routes[0]?.name).toBe("shipping.zoneLocations.update")
		expect(fieldsOf(outcome.routes[0])).toContain("description")
	})

	it("ranks a request-property match above a response-property match", () => {
		const outcome = found(searchRoutes(stateWith(), { query: "status" }))

		// `status` is a query parameter of the listing and a property of the book every route answers
		// with. The route that takes it as an argument is the one an agent means.
		expect(outcome.routes[0]?.name).toBe("postTypes.book.list")
		expect(fieldsOf(outcome.routes[0])).toContain("input.query.property")
	})

	it("orders equal scores by route name, so two calls agree", () => {
		const first = names(searchRoutes(stateWith(), { query: "book" }))
		const second = names(searchRoutes(stateWith(), { query: "book" }))

		expect(first).toEqual(second)
	})

	it("browses the whole catalog when the query is omitted", () => {
		const outcome = found(searchRoutes(stateWith(), {}))

		expect(outcome.count).toBe(5)
		expect(outcome.routes.map((route) => route.name)).toEqual([
			"postTypes.book.create",
			"postTypes.book.list",
			"postTypes.book.restoreRevision",
			"postTypes.book.retrieve",
			"shipping.zoneLocations.update",
		])
	})

	it("treats an empty query the same as an omitted one", () => {
		expect(names(searchRoutes(stateWith(), { query: "   " }))).toEqual(names(searchRoutes(stateWith(), {})))
	})

	it("filters by namespace, method, and read or write", () => {
		expect(found(searchRoutes(stateWith(), { namespace: "kizlo/v1" })).count).toBe(4)
		expect(names(searchRoutes(stateWith(), { method: "put" }))).toEqual(["shipping.zoneLocations.update"])
		expect(names(searchRoutes(stateWith(), { access: "read" }))).toEqual(["postTypes.book.list", "postTypes.book.retrieve"])
		expect(found(searchRoutes(stateWith(), { access: "write" })).count).toBe(3)
	})

	it("pages with a stable cursor", () => {
		const first = found(searchRoutes(stateWith(), { limit: 2 }))
		expect(first.count).toBe(5)
		expect(first.routes).toHaveLength(2)
		expect(first.nextCursor).toBeDefined()

		const second = found(searchRoutes(stateWith(), { limit: 2, cursor: first.nextCursor }))
		const third = found(searchRoutes(stateWith(), { limit: 2, cursor: second.nextCursor }))

		expect(third.routes).toHaveLength(1)
		expect(third.nextCursor).toBeUndefined()
		expect([...first.routes, ...second.routes, ...third.routes].map((route) => route.name)).toEqual(names(searchRoutes(stateWith(), {})))
	})

	it("marks a deprecated route as deprecated", () => {
		const document: IntrospectionDocument = {
			...INTROSPECTION_FIXTURE,
			apis: {
				"post-types.leaflet": {
					namespace: "kizlo/v1",
					paths: {
						"/post-types/leaflet": {
							list: { method: "GET", deprecated: true, errors: [], input: {}, responses: { "200": { content_type: "application/json" } } },
						},
					},
				},
			},
		}

		expect(found(searchRoutes(stateWith(document), {})).routes[0]).toMatchObject({ deprecated: true })
	})

	it("drops the weak tail of a match instead of counting the whole catalog", () => {
		// One route takes `widget` as a field; the rest only mention the word once, buried in prose. All
		// of them "match" the term, but reporting nine matches would tell a caller nothing.
		const paths: Record<string, Record<string, never>> = {}
		for (let index = 0; index < 8; index++) {
			paths[`/filler/${index}`] = {
				[`list${index}`]: {
					method: "GET",
					errors: [],
					input: {
						query: {
							type: "object",
							properties: {
								alpha: { type: "string", description: "Some unrelated prose about a widget among many other words here." },
								beta: { type: "string", description: "More unrelated prose entirely, with plenty of additional filler text." },
								gamma: { type: "string", description: "Yet more unrelated prose, long enough to dilute any single term." },
							},
						},
					},
					responses: { "200": { content_type: "application/json" } },
				},
			} as never
		}
		paths["/widgets"] = {
			create: {
				method: "POST",
				errors: [],
				input: { body: { type: "object", properties: { widget: { type: "string", required: true } } } },
				responses: { "201": { content_type: "application/json" } },
			},
		} as never

		const document: IntrospectionDocument = {
			...INTROSPECTION_FIXTURE,
			apis: { widgets: { namespace: "kizlo/v1", paths } },
		}

		const outcome = found(searchRoutes(stateWith(document), { query: "widget" }))

		expect(outcome.routes[0]?.name).toBe("widgets.create")
		expect(outcome.count).toBeLessThan(9)
	})

	it("returns no match rather than a guess, and names the namespaces it does serve", () => {
		const outcome = found(searchRoutes(stateWith(), { query: "zzzzunrelated" }))

		expect(outcome.count).toBe(0)
		expect(outcome.routes).toEqual([])
		expect(outcome.message).toContain("kizlo/v1")
	})

	it("says which filters were in force when they matched nothing", () => {
		const outcome = found(searchRoutes(stateWith(), { query: "book", namespace: "wc/v3" }))

		expect(outcome.count).toBe(0)
		expect(outcome.message).toContain('namespace "wc/v3"')
	})

	it("says the contract has not arrived rather than reporting an empty WordPress", () => {
		const result = searchRoutes({ credentials })

		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error.message).toContain("not been fetched yet")
	})

	it("searches the document the holder carries now, not the one it started with", () => {
		const state = stateWith()
		expect(names(searchRoutes(state, {}))).not.toContain("postTypes.magazine.list")

		// What the watcher's poll does when WordPress has moved: replace the held document in place.
		state.document = {
			...INTROSPECTION_FIXTURE,
			apis: {
				...INTROSPECTION_FIXTURE.apis,
				"post-types.magazine": {
					namespace: "kizlo/v1",
					paths: {
						"/post-types/magazine": {
							list: { method: "GET", errors: [], input: {}, responses: { "200": { content_type: "application/json" } } },
						},
					},
				},
			},
		}

		expect(names(searchRoutes(state, {}))).toContain("postTypes.magazine.list")
	})
})

describe("describeRoute", () => {
	it("returns the route's argument schema with its path parameters named", () => {
		const described = value(describeRoute(stateWith(), { route: "postTypes.book.retrieve" }))
		const input = described.input as Record<string, unknown>

		expect(described).toMatchObject({ method: "GET", path: "/post-types/book/{identifier}", pathParameters: ["identifier"] })
		// The parts are the schema's top level now, and `params` is demanded because something in it is.
		expect(input.required).toEqual(["params"])
		const params = (input.properties as Record<string, { required?: string[] }>).params
		expect(params?.required).toEqual(["identifier"])
	})

	it("resolves the schemas an input extends", () => {
		const input = value(describeRoute(stateWith(), { route: "postTypes.book.create" })).input as Record<string, unknown>
		const body = (input.properties as Record<string, { properties?: Record<string, unknown>; required?: string[] }>).body

		expect(Object.keys(body?.properties ?? {})).toEqual(["title"])
		expect(body?.required).toEqual(["title"])
	})

	it("returns a response schema for each status, with its content type and headers", () => {
		const responses = value(describeRoute(stateWith(), { route: "postTypes.book.list" })).responses as Record<
			string,
			Record<string, unknown>
		>

		expect(Object.keys(responses).sort()).toEqual(["200", "400"])
		expect(responses["200"]).toMatchObject({ content_type: "application/json" })

		const headers = responses["200"]?.headers as Record<string, unknown>
		expect(Object.keys(headers.properties as Record<string, unknown>)).toEqual(["X-WP-Total"])

		// The body is an array of a referenced schema, so the reference is a pointer and the definition
		// travels with it.
		const body = responses["200"]?.body as Record<string, Record<string, unknown>>
		expect(body.items).toEqual({ $ref: "#/$defs/acme.book" })
		expect(body.$defs).toHaveProperty("acme.book")
	})

	it("returns the error codes the route declares, and nothing it does not", () => {
		const described = value(describeRoute(stateWith(), { route: "shipping.zoneLocations.update" }))

		expect(described.errors).toEqual(["woocommerce_rest_shipping_zone_invalid"])
	})

	it("keeps the summary, description, and path parameters the document carries", () => {
		const described = value(describeRoute(stateWith(), { route: "postTypes.book.restoreRevision" }))

		expect(described).toMatchObject({
			summary: "Restore a book to one of its revisions",
			pathParameters: ["identifier"],
		})
		expect(value(describeRoute(stateWith(), { route: "postTypes.book.retrieve" })).description).toBe("Retrieve one book.")
	})

	it("points an unknown route at the search tool", () => {
		const result = describeRoute(stateWith(), { route: "postTypes.book.destroy" })

		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.error.message).toContain("kizlo_search_routes")
	})
})

describe("callRoute", () => {
	it("interpolates path parameters and sends the rest as query", async () => {
		const calls = captureFetch({ id: 7 })

		const result = await callRoute(stateWith(), {
			route: "postTypes.book.retrieve",
			input: { params: { identifier: "my-book" }, query: { context: "edit" } },
		})

		expect(result).toEqual({ ok: true, value: { status: 200, data: { id: 7 } } })
		expect(calls[0]?.method).toBe("GET")
		expect(calls[0]?.url).toBe("https://wp.example/wp-json/kizlo/v1/post-types/book/my-book?context=edit")
	})

	it("reports a path parameter it cannot interpolate as a request failure, without sending anything", async () => {
		const calls = captureFetch()

		const result = await callRoute(stateWith(), { route: "postTypes.book.retrieve", input: {} })

		expect(result.ok).toBe(false)
		if (!result.ok) {
			expect(result.error.kind).toBe("request")
			expect(result.error.message).toContain("identifier")
		}
		expect(calls).toHaveLength(0)
	})

	it("sends a non-GET route as the body its content type declares", async () => {
		const calls = captureFetch({ id: 12 }, 201)

		const result = await callRoute(stateWith(), { route: "postTypes.book.create", input: { body: { title: "New" } } })

		expect(result).toEqual({ ok: true, value: { status: 201, data: { id: 12 } } })
		expect(calls[0]?.method).toBe("POST")
		expect(calls[0]?.body).toBe(JSON.stringify({ title: "New" }))
	})

	it("keeps what WordPress refused, its data included, alongside the route it was asked of", async () => {
		captureFetch({ code: "rest_not_found", message: "No book.", data: { status: 404, params: { identifier: "gone" } } }, 404)

		const result = await callRoute(stateWith(), { route: "postTypes.book.retrieve", input: { params: { identifier: "gone" } } })

		expect(result.ok).toBe(false)
		if (!result.ok && result.error.kind === "response") {
			expect(result.error).toMatchObject({
				kind: "response",
				route: "postTypes.book.retrieve",
				method: "GET",
				path: "/post-types/book/{identifier}",
				status: 404,
			})
			// Unchanged, rather than flattened into the summary line.
			expect(result.error.error).toMatchObject({
				code: "rest_not_found",
				message: "No book.",
				data: { status: 404, params: { identifier: "gone" } },
			})
			expect(result.error.message).toContain("rest_not_found")
		} else {
			throw new Error("expected a response failure")
		}
	})

	it("keeps the refusal readable after it is serialized to the client", async () => {
		captureFetch({ code: "rest_invalid_param", message: "Invalid parameter(s): status", data: { status: 400 } }, 400)

		const result = await callRoute(stateWith(), { route: "postTypes.book.list", input: { query: { status: "nope" } } })

		expect(result.ok).toBe(false)
		if (result.ok) throw new Error("expected a failure")

		// `WP_Error` keeps its message on `Error`, which JSON drops. The wire form has to carry it.
		const wire = JSON.parse(JSON.stringify(result.error)) as { error: { code: string; message: string; data: unknown } }
		expect(wire.error).toEqual({ code: "rest_invalid_param", message: "Invalid parameter(s): status", data: { status: 400 } })
	})

	it("refuses to call anything without a connection", async () => {
		const result = await callRoute({ document: INTROSPECTION_FIXTURE }, { route: "postTypes.book.list" })

		expect(result.ok).toBe(false)
		if (!result.ok) {
			expect(result.error.kind).toBe("request")
			expect(result.error.message).toContain(".env")
		}
	})

	it("calls the connection the holder carries now, not the one it started with", async () => {
		const calls = captureFetch()
		const state = stateWith()

		await callRoute(state, { route: "postTypes.book.list" })
		expect(calls[0]?.url).toContain("https://wp.example/")

		// What a `.env` change does: the watcher restarts and writes the new connection into the holder.
		state.credentials = { url: "https://moved.example", username: "admin", password: "other" }
		await callRoute(state, { route: "postTypes.book.list" })

		expect(calls[1]?.url).toContain("https://moved.example/")
	})
})
