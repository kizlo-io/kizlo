import { afterEach, describe, expect, it, vi } from "vitest"
import { INTROSPECTION_FIXTURE } from "../../wordpress/introspection.fixture"
import { isAllowedOrigin, MCP_HOST, MCP_PATH, type McpServerHandle, startMcpServer } from "./server"
import type { McpState } from "./state"

/** What a `tools/call` answers with, as far as these tests read it. */
interface ToolCallPayload {
	error?: { code: number; message: string }
	result?: {
		content?: { type: string; text: string }[]
		structuredContent?: unknown
		isError?: boolean
	}
}

describe("isAllowedOrigin", () => {
	it("allows a request that sends no Origin, which is what a native MCP client does", () => {
		expect(isAllowedOrigin(undefined)).toBe(true)
		expect(isAllowedOrigin("")).toBe(true)
	})

	it.each(["http://127.0.0.1:8099", "http://localhost:3000", "http://[::1]:5173", "https://localhost"])(
		"allows the loopback origin %s",
		(origin) => {
			expect(isAllowedOrigin(origin)).toBe(true)
		},
	)

	it.each(["https://evil.example", "http://127.0.0.1.evil.example", "http://192.168.1.4:8099", "null", "not a url"])(
		"refuses %s",
		(origin) => {
			expect(isAllowedOrigin(origin)).toBe(false)
		},
	)
})

describe("startMcpServer", () => {
	let handle: McpServerHandle | undefined

	afterEach(async () => {
		await handle?.stop()
		handle = undefined
		vi.unstubAllGlobals()
	})

	/** Answer WordPress, and let the loopback requests these tests make through untouched. */
	function stubWordPress(body: unknown, status = 200): void {
		const real = globalThis.fetch
		vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
			const url = input instanceof Request ? input.url : String(input)
			if (!url.includes("wp.example")) return real(input as never, init)
			return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
		})
	}

	async function callTool(url: string, id: number, name: string, args: Record<string, unknown> = {}): Promise<ToolCallPayload> {
		const response = await post(url, { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } })
		return (await response.json()) as ToolCallPayload
	}

	const state: McpState = { document: INTROSPECTION_FIXTURE, credentials: { url: "https://wp.example", username: "a", password: "b" } }

	/** The initialize handshake, which is the first thing any MCP client sends. */
	const initialize = {
		jsonrpc: "2.0",
		id: 1,
		method: "initialize",
		params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1.0.0" } },
	}

	async function post(url: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
		return fetch(url, {
			method: "POST",
			headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
			body: JSON.stringify(body),
		})
	}

	it("completes initialization for a client that sends no Origin", async () => {
		handle = await startMcpServer(state, { port: 0 })

		const response = await post(handle.url, initialize)

		expect(response.status).toBe(200)
		const payload = (await response.json()) as { result: { serverInfo: { name: string } } }
		expect(payload.result.serverInfo.name).toBe("kizlo")
	})

	it("refuses a request carrying an Origin that is not loopback", async () => {
		handle = await startMcpServer(state, { port: 0 })

		const response = await post(handle.url, initialize, { origin: "https://evil.example" })

		expect(response.status).toBe(403)
	})

	it("serves a request carrying a loopback Origin", async () => {
		handle = await startMcpServer(state, { port: 0 })

		const response = await post(handle.url, initialize, { origin: `http://localhost:${handle.port}` })

		expect(response.status).toBe(200)
	})

	it("serves nothing outside its own path", async () => {
		handle = await startMcpServer(state, { port: 0 })

		const response = await post(`http://${MCP_HOST}:${handle.port}/`, initialize)

		expect(response.status).toBe(404)
	})

	it("binds loopback only, so no other interface reaches it", async () => {
		handle = await startMcpServer(state, { port: 0 })

		expect(handle.url).toBe(`http://127.0.0.1:${handle.port}${MCP_PATH}`)

		// The criterion is reachability, not who else could bind the port: on Linux a `0.0.0.0` bind
		// collides with a loopback one anyway, so claiming the port proves nothing either way. Every
		// address this machine answers on besides loopback must refuse the connection outright.
		const { networkInterfaces } = await import("node:os")
		const external = Object.values(networkInterfaces())
			.flat()
			.filter((address) => address?.family === "IPv4" && !address.internal)
			.map((address) => address?.address)
			.filter((address): address is string => address !== undefined)

		for (const address of external) {
			await expect(
				fetch(`http://${address}:${handle.port}${MCP_PATH}`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: "{}",
					signal: AbortSignal.timeout(2_000),
				}),
			).rejects.toThrow()
		}
	})

	/** Initialize, then confirm it: a server refuses ordinary requests until the client has done both. */
	async function handshake(url: string): Promise<void> {
		await post(url, initialize)
		await post(url, { jsonrpc: "2.0", method: "notifications/initialized" })
	}

	it("advertises the three dispatchers rather than a tool per route", async () => {
		handle = await startMcpServer(state, { port: 0 })
		await handshake(handle.url)

		const response = await post(handle.url, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
		const payload = (await response.json()) as { result: { tools: { name: string; outputSchema?: unknown }[] } }
		const tools = payload.result.tools

		expect(tools.map((tool) => tool.name).sort()).toEqual(["kizlo_call", "kizlo_describe_route", "kizlo_search_routes"])
		// Every one declares what it answers with, which is what makes `structuredContent` readable.
		expect(tools.every((tool) => tool.outputSchema !== undefined)).toBe(true)
	})

	it("runs a tool over the transport", async () => {
		handle = await startMcpServer(state, { port: 0 })
		await handshake(handle.url)

		const payload = await callTool(handle.url, 3, "kizlo_search_routes", { namespace: "kizlo/v1" })

		expect(payload.result?.structuredContent).toMatchObject({ count: 4 })
	})

	it("answers a search as both structured content and a summary a reader can use", async () => {
		handle = await startMcpServer(state, { port: 0 })
		await handshake(handle.url)

		const payload = await callTool(handle.url, 6, "kizlo_search_routes", { query: "replace" })
		const text = payload.result?.content?.[0]?.text ?? ""

		expect(payload.result?.structuredContent).toMatchObject({ count: 1 })
		// The one result worth compressing: prose rather than the JSON the other two return.
		expect(text).toContain("shipping.zoneLocations.update")
		expect(() => JSON.parse(text)).toThrow()
	})

	it("returns a successful call as structured content and text, and the SDK accepts it", async () => {
		stubWordPress({ id: 7, title: "A book" })
		handle = await startMcpServer(state, { port: 0 })
		await handshake(handle.url)

		const payload = await callTool(handle.url, 7, "kizlo_call", {
			route: "postTypes.book.retrieve",
			input: { params: { identifier: "a-book" } },
		})

		expect(payload.error).toBeUndefined()
		expect(payload.result?.isError).toBeFalsy()
		expect(payload.result?.structuredContent).toMatchObject({ status: 200, data: { id: 7 } })
		expect(JSON.parse(payload.result?.content?.[0]?.text ?? "{}")).toMatchObject({ status: 200 })
	})

	it("passes output validation for a route whose response is not an object", async () => {
		// The declared output schema is deliberately permissive: an array body would otherwise turn a
		// working route call into a protocol error rather than an answer.
		stubWordPress([{ code: "GB" }, { code: "FR" }])
		handle = await startMcpServer(state, { port: 0 })
		await handshake(handle.url)

		const payload = await callTool(handle.url, 8, "kizlo_call", {
			route: "shipping.zoneLocations.update",
			input: { params: { zone_id: 3 }, body: [{ code: "GB" }] },
		})

		expect(payload.error).toBeUndefined()
		expect(payload.result?.structuredContent).toMatchObject({ status: 200, data: [{ code: "GB" }, { code: "FR" }] })
	})

	it("keeps a failed call an error, with what WordPress refused still readable", async () => {
		stubWordPress({ code: "rest_not_found", message: "No book.", data: { status: 404 } }, 404)
		handle = await startMcpServer(state, { port: 0 })
		await handshake(handle.url)

		const payload = await callTool(handle.url, 9, "kizlo_call", {
			route: "postTypes.book.retrieve",
			input: { params: { identifier: "gone" } },
		})

		expect(payload.result?.isError).toBe(true)
		// A summary first, then the failure itself, so a reader and a parser both get what they need.
		expect(payload.result?.content?.[0]?.text).toContain("rest_not_found")
		expect(JSON.parse(payload.result?.content?.[1]?.text ?? "{}")).toMatchObject({
			kind: "response",
			route: "postTypes.book.retrieve",
			method: "GET",
			status: 404,
			error: { code: "rest_not_found", message: "No book.", data: { status: 404 } },
		})
	})

	/**
	 * A client validates `structuredContent` against the tool's declared output schema whether or not
	 * the result is an error, so a failure put there is rejected outright rather than read. Every tool
	 * here declares an output schema, so none of them may answer a failure that way.
	 */
	it("leaves structuredContent off a failure, whichever tool failed", async () => {
		stubWordPress({ code: "rest_not_found", message: "No book." }, 404)
		handle = await startMcpServer(state, { port: 0 })
		await handshake(handle.url)

		const failures = [
			await callTool(handle.url, 10, "kizlo_call", { route: "postTypes.book.nope" }),
			await callTool(handle.url, 11, "kizlo_call", { route: "postTypes.book.retrieve", input: {} }),
			await callTool(handle.url, 12, "kizlo_call", { route: "postTypes.book.retrieve", input: { params: { identifier: "gone" } } }),
			await callTool(handle.url, 13, "kizlo_describe_route", { route: "postTypes.book.nope" }),
		]

		for (const failure of failures) {
			expect(failure.result?.isError).toBe(true)
			expect(failure.result?.structuredContent).toBeUndefined()
			expect(JSON.parse(failure.result?.content?.[1]?.text ?? "{}").kind).toMatch(/^(request|response)$/)
		}
	})

	it("reports a missing document as a failure from the search tool too", async () => {
		handle = await startMcpServer({ credentials: { url: "https://wp.example", username: "a", password: "b" } }, { port: 0 })
		await handshake(handle.url)

		const payload = await callTool(handle.url, 14, "kizlo_search_routes", {})

		expect(payload.result?.isError).toBe(true)
		expect(payload.result?.structuredContent).toBeUndefined()
		expect(JSON.parse(payload.result?.content?.[1]?.text ?? "{}")).toMatchObject({ kind: "request" })
	})

	it("keeps serving across a watcher reload, on the same socket and the current state", async () => {
		// The holder a session owns: the watcher replaces its contents on every restart, and the server
		// is never rebound. Standing in for a `.env` change that moved the contract.
		const reloadable: McpState = {
			document: INTROSPECTION_FIXTURE,
			credentials: { url: "https://wp.example", username: "a", password: "b" },
		}
		handle = await startMcpServer(reloadable, { port: 0 })
		const { url, port } = handle
		await handshake(url)

		const before = await callTool(url, 4, "kizlo_search_routes")
		expect(before.result?.structuredContent).toMatchObject({ count: 5 })

		reloadable.document = {
			...INTROSPECTION_FIXTURE,
			apis: {
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

		// Same URL, same port, no second handshake: the socket never moved.
		const after = await callTool(url, 5, "kizlo_search_routes")
		const structured = after.result?.structuredContent as { count: number; routes: { name: string }[] }

		expect(handle.port).toBe(port)
		expect(structured).toMatchObject({ count: 1 })
		expect(structured.routes[0]?.name).toBe("postTypes.magazine.list")
	})

	it("stops listening once the session ends", async () => {
		const started = await startMcpServer(state, { port: 0 })
		const { url } = started
		await started.stop()

		await expect(post(url, initialize)).rejects.toThrow()
	})
})
