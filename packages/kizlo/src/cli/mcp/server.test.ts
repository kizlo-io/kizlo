import { afterEach, describe, expect, it } from "vitest"
import { INTROSPECTION_FIXTURE } from "../../wordpress/introspection.fixture"
import { isAllowedOrigin, MCP_HOST, MCP_PATH, type McpServerHandle, startMcpServer } from "./server"
import type { McpState } from "./state"

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
	})

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
		const payload = (await response.json()) as { result: { tools: { name: string }[] } }

		expect(payload.result.tools.map((tool) => tool.name).sort()).toEqual(["kizlo_call", "kizlo_describe_route", "kizlo_list_routes"])
	})

	it("runs a tool over the transport", async () => {
		handle = await startMcpServer(state, { port: 0 })
		await handshake(handle.url)

		const response = await post(handle.url, {
			jsonrpc: "2.0",
			id: 3,
			method: "tools/call",
			params: { name: "kizlo_list_routes", arguments: { namespace: "kizlo/v1" } },
		})
		const payload = (await response.json()) as { result: { content: { text: string }[] } }

		expect(JSON.parse(payload.result.content[0]?.text ?? "{}")).toMatchObject({ count: 4 })
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

		const before = await post(url, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "kizlo_list_routes", arguments: {} } })
		expect(
			JSON.parse(((await before.json()) as { result: { content: { text: string }[] } }).result.content[0]?.text ?? "{}"),
		).toMatchObject({
			count: 4,
		})

		reloadable.document = {
			...INTROSPECTION_FIXTURE,
			apis: {
				"post-types.magazine": {
					namespace: "kizlo/v1",
					paths: {
						"/post-types/magazine": {
							list: { method: "GET", errors: [], input: { type: "object" }, responses: { "200": { content_type: "application/json" } } },
						},
					},
				},
			},
		}

		// Same URL, same port, no second handshake: the socket never moved.
		const after = await post(url, { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "kizlo_list_routes", arguments: {} } })
		const payload = JSON.parse(((await after.json()) as { result: { content: { text: string }[] } }).result.content[0]?.text ?? "{}")

		expect(handle.port).toBe(port)
		expect(payload).toMatchObject({ count: 1 })
		expect(payload.routes[0].name).toBe("postTypes.magazine.list")
	})

	it("stops listening once the session ends", async () => {
		const started = await startMcpServer(state, { port: 0 })
		const { url } = started
		await started.stop()

		await expect(post(url, initialize)).rejects.toThrow()
	})
})
