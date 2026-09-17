import { createServer, type Server } from "node:net"
import { afterEach, describe, expect, test, vi } from "vitest"
import { INTROSPECTION_FIXTURE } from "../../wordpress/introspection.fixture"
import type { ResolvedMcpConfig } from "../daemon/config"
import { log } from "../daemon/logger"
import { resolveMcpPort, startMcp } from "."
import { MCP_HOST } from "./server"

const open: Server[] = []

afterEach(async () => {
	await Promise.all(open.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
	vi.restoreAllMocks()
})

/** Bind `127.0.0.1:port` and hold it for the test, the way another process on the machine would. */
function occupy(port: number): Promise<Server> {
	return new Promise((resolve, reject) => {
		const server = createServer()
		open.push(server)
		server.once("error", reject)
		server.listen({ port, host: MCP_HOST }, () => resolve(server))
	})
}

/** A loopback port nothing is listening on right now. */
async function freePort(): Promise<number> {
	const server = await occupy(0)
	const port = (server.address() as { port: number }).port
	await new Promise<void>((resolve) => server.close(() => resolve()))
	open.splice(open.indexOf(server), 1)
	return port
}

function config(overrides: Partial<ResolvedMcpConfig> = {}): ResolvedMcpConfig {
	return { port: 8300, portExplicit: false, ...overrides }
}

describe("resolveMcpPort", () => {
	test("steps past a default port that is taken, so two projects need no configuration", async () => {
		const taken = await freePort()
		await occupy(taken)

		await expect(resolveMcpPort(config({ port: taken }))).resolves.not.toBe(taken)
	})

	test("returns an explicitly configured port that is free", async () => {
		const port = await freePort()

		await expect(resolveMcpPort(config({ port, portExplicit: true }))).resolves.toBe(port)
	})

	test("stops the command naming mcp.port when an explicitly configured port is taken", async () => {
		const port = await freePort()
		await occupy(port)
		vi.spyOn(log, "error").mockImplementation(() => {})
		const exit = vi.spyOn(process, "exit").mockImplementation((() => {
			throw new Error("exited")
		}) as never)

		await expect(resolveMcpPort(config({ port, portExplicit: true }))).rejects.toThrow("exited")

		expect(exit).toHaveBeenCalledWith(1)
		const said = vi.mocked(log.error).mock.calls.flat().join(" ")
		expect(said).toContain("mcp.port")
		expect(said).toContain("never auto-reassigned")
	})
})

describe("startMcp", () => {
	test("stays off and says why when there is no WordPress connection", async () => {
		vi.spyOn(log, "info").mockImplementation(() => {})

		await expect(startMcp({ document: INTROSPECTION_FIXTURE }, await freePort())).resolves.toBeUndefined()

		expect(vi.mocked(log.info).mock.calls.flat().join(" ")).toContain("MCP server is off")
	})

	test("reports the address a harness should be pointed at", async () => {
		vi.spyOn(log, "success").mockImplementation(() => {})
		const state = { document: INTROSPECTION_FIXTURE, credentials: { url: "https://wp.example", username: "a", password: "b" } }
		const port = await freePort()

		const handle = await startMcp(state, port)
		try {
			expect(handle?.url).toBe(`http://${MCP_HOST}:${port}/mcp`)
			expect(vi.mocked(log.success).mock.calls.flat().join(" ")).toContain(handle?.url)
		} finally {
			await handle?.stop()
		}
	})

	test("would stop the session if its own pinned port were resolved a second time", async () => {
		// Why a session resolves `mcp.port` once and carries it through every reboot: the server holds
		// the port for as long as the session lasts, so re-probing finds it taken and, pinned, exits.
		vi.spyOn(log, "success").mockImplementation(() => {})
		vi.spyOn(log, "error").mockImplementation(() => {})
		vi.spyOn(process, "exit").mockImplementation((() => {
			throw new Error("exited")
		}) as never)
		const port = await freePort()
		const pinned = config({ port, portExplicit: true })
		const state = { document: INTROSPECTION_FIXTURE, credentials: { url: "https://wp.example", username: "a", password: "b" } }

		const handle = await startMcp(state, await resolveMcpPort(pinned))
		try {
			await expect(resolveMcpPort(pinned)).rejects.toThrow("exited")
		} finally {
			await handle?.stop()
		}
	})

	test("says so rather than throwing when the port cannot be bound", async () => {
		vi.spyOn(log, "error").mockImplementation(() => {})
		const port = await freePort()
		await occupy(port)
		const state = { document: INTROSPECTION_FIXTURE, credentials: { url: "https://wp.example", username: "a", password: "b" } }

		await expect(startMcp(state, port)).resolves.toBeUndefined()
		expect(vi.mocked(log.error).mock.calls.flat().join(" ")).toContain("Failed to start the MCP server")
	})
})
