import { afterEach, describe, expect, it, vi } from "vitest"
import type { IntrospectionDocument } from "../../wordpress/introspection"
import { INTROSPECTION_FIXTURE } from "../../wordpress/introspection.fixture"
import type { McpState } from "./state"
import { callRoute, describeRoute, listRoutes } from "./tools"

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

afterEach(() => {
	vi.unstubAllGlobals()
})

describe("listRoutes", () => {
	it("names routes the way the generated client does", () => {
		const result = listRoutes(stateWith())
		if (!result.ok) throw new Error(result.error)
		const value = result.value as { count: number; routes: { name: string; method: string; summary?: string }[] }

		expect(value.count).toBe(5)
		expect(value.routes.map((route) => route.name)).toEqual([
			"postTypes.book.create",
			"postTypes.book.list",
			"postTypes.book.restoreRevision",
			"postTypes.book.retrieve",
			"shipping.zoneLocations.update",
		])
		expect(value.routes.find((route) => route.name === "postTypes.book.list")).toMatchObject({
			method: "GET",
			summary: "List books",
		})
	})

	it("filters by namespace", () => {
		const result = listRoutes(stateWith(), { namespace: "kizlo/v1" })
		if (!result.ok) throw new Error(result.error)

		expect((result.value as { count: number }).count).toBe(4)
	})

	it("names the namespaces WordPress serves when the filter matches none", () => {
		const result = listRoutes(stateWith(), { namespace: "acme/v1" })

		expect(result).toEqual({ ok: false, error: expect.stringContaining("kizlo/v1") })
	})

	it("says the contract has not arrived rather than reporting an empty WordPress", () => {
		const result = listRoutes({ credentials })

		expect(result).toEqual({ ok: false, error: expect.stringContaining("not been fetched yet") })
	})
})

describe("describeRoute", () => {
	it("returns the route's argument schema with its path parameters named", () => {
		const result = describeRoute(stateWith(), { route: "postTypes.book.retrieve" })
		if (!result.ok) throw new Error(result.error)
		const value = result.value as { method: string; path: string; pathParameters: string[]; input: Record<string, unknown> }

		expect(value).toMatchObject({ method: "GET", path: "/post-types/book/{identifier}", pathParameters: ["identifier"] })
		// The parts are the schema's top level now, and `params` is demanded because something in it is.
		expect(value.input.required).toEqual(["params"])
		const params = (value.input.properties as Record<string, { required?: string[] }>).params
		expect(params?.required).toEqual(["identifier"])
	})

	it("resolves the schemas an input extends", () => {
		const result = describeRoute(stateWith(), { route: "postTypes.book.create" })
		if (!result.ok) throw new Error(result.error)
		const input = (result.value as { input: Record<string, unknown> }).input

		const body = (input.properties as Record<string, { properties?: Record<string, unknown>; required?: string[] }>).body
		expect(Object.keys(body?.properties ?? {})).toEqual(["title"])
		expect(body?.required).toEqual(["title"])
	})

	it("points an unknown route at the listing tool", () => {
		const result = describeRoute(stateWith(), { route: "postTypes.book.destroy" })

		expect(result).toEqual({ ok: false, error: expect.stringContaining("kizlo_list_routes") })
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

	it("reports a path parameter it cannot interpolate without sending anything", async () => {
		const calls = captureFetch()

		const result = await callRoute(stateWith(), { route: "postTypes.book.retrieve", input: {} })

		expect(result).toEqual({ ok: false, error: expect.stringContaining("identifier") })
		expect(calls).toHaveLength(0)
	})

	it("sends a non-GET route as the body its content type declares", async () => {
		const calls = captureFetch({ id: 12 }, 201)

		const result = await callRoute(stateWith(), { route: "postTypes.book.create", input: { body: { title: "New" } } })

		expect(result).toEqual({ ok: true, value: { status: 201, data: { id: 12 } } })
		expect(calls[0]?.method).toBe("POST")
		expect(calls[0]?.body).toBe(JSON.stringify({ title: "New" }))
	})

	it("reports what WordPress refused rather than the raw envelope", async () => {
		captureFetch({ code: "rest_not_found", message: "No book." }, 404)

		const result = await callRoute(stateWith(), { route: "postTypes.book.retrieve", input: { params: { identifier: "gone" } } })

		expect(result).toEqual({ ok: false, error: expect.stringContaining("rest_not_found") })
	})

	it("refuses to call anything without a connection", async () => {
		const result = await callRoute({ document: INTROSPECTION_FIXTURE }, { route: "postTypes.book.list" })

		expect(result).toEqual({ ok: false, error: expect.stringContaining(".env") })
	})
})

describe("document handover", () => {
	it("serves a route that only the replacement document has, with no refetch of its own", async () => {
		const calls = captureFetch()
		const state = stateWith()

		expect(describeRoute(state, { route: "postTypes.magazine.list" }).ok).toBe(false)

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

		const listed = listRoutes(state)
		if (!listed.ok) throw new Error(listed.error)
		expect((listed.value as { routes: { name: string }[] }).routes.map((route) => route.name)).toContain("postTypes.magazine.list")
		expect(describeRoute(state, { route: "postTypes.magazine.list" }).ok).toBe(true)

		// Nothing above reached WordPress: the document is handed over, never fetched here.
		expect(calls).toHaveLength(0)
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
