import { describe, expect, test, vi } from "vitest"
import { fetchIntrospection, IntrospectionFetchError } from "./fetch-introspection"
import { InvalidIntrospectionDocumentError } from "./introspection"
import { INTROSPECTION_FIXTURE } from "./introspection.fixture"
import type { WordPressCredentials } from "./types"

const CREDENTIALS: WordPressCredentials = { url: "https://wp.example", username: "admin", password: "secret" }

function responds(response: Response | Error): typeof globalThis.fetch {
	return vi.fn(async () => {
		if (response instanceof Error) throw response
		return response
	}) as unknown as typeof globalThis.fetch
}

describe("fetchIntrospection", () => {
	test("resolves a contract WordPress excluded contributions from, diagnostics intact", async () => {
		const diagnostics = [
			...INTROSPECTION_FIXTURE.diagnostics,
			{ type: "error" as const, message: "Referenced schema does not exist.", data: { schema_id: "vendor.money" } },
		]

		// What to do about an exclusion is the generator's policy. This function only reports it, so a
		// broken third-party declaration cannot decide on its own that nothing gets generated.
		const result = await fetchIntrospection(CREDENTIALS, { fetch: responds(Response.json({ ...INTROSPECTION_FIXTURE, diagnostics })) })

		expect(result.status).toBe("modified")
		expect(result.document?.diagnostics).toEqual(diagnostics)
		expect(result.document?.schemas["acme.book"]).toBeDefined()
	})

	test("falls back to the document hash when WordPress sends no ETag", async () => {
		const result = await fetchIntrospection(CREDENTIALS, { fetch: responds(Response.json(INTROSPECTION_FIXTURE)) })
		expect(result.etag).toBe(`"${INTROSPECTION_FIXTURE.hash}"`)
	})

	test("reports a revalidated contract as unchanged", async () => {
		const result = await fetchIntrospection(CREDENTIALS, { etag: '"cached"', fetch: responds(new Response(null, { status: 304 })) })
		expect(result).toEqual({ status: "not-modified", etag: '"cached"', pluginVersion: null })
	})

	test("carries the plugin version WordPress stamped, on a document and on a 304 alike", async () => {
		const headers = { "x-kizlo-version": "0.8.1" }
		const document = await fetchIntrospection(CREDENTIALS, { fetch: responds(Response.json(INTROSPECTION_FIXTURE, { headers })) })
		expect(document.pluginVersion).toBe("0.8.1")

		const revalidated = await fetchIntrospection(CREDENTIALS, { fetch: responds(new Response(null, { status: 304, headers })) })
		expect(revalidated.pluginVersion).toBe("0.8.1")
	})

	test("reports a plugin predating the version header as null", async () => {
		const result = await fetchIntrospection(CREDENTIALS, { fetch: responds(Response.json(INTROSPECTION_FIXTURE)) })
		expect(result.pluginVersion).toBeNull()
	})

	test.each([
		["a transport failure", new Error("offline"), IntrospectionFetchError],
		["a non-2xx status", new Response("no", { status: 403 }), IntrospectionFetchError],
		["a body that is not JSON", new Response("<html>", { status: 200 }), IntrospectionFetchError],
		["a document that does not parse", Response.json({ nope: true }), InvalidIntrospectionDocumentError],
	])("throws on %s", async (_label, response, expected) => {
		await expect(fetchIntrospection(CREDENTIALS, { fetch: responds(response) })).rejects.toThrow(expected)
	})
})
