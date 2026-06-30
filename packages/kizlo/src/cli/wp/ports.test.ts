import { type AddressInfo, createServer, type Server } from "node:net"
import { afterEach, describe, expect, test } from "vitest"
import { findFreePort, isFree, PortInUseError, resolveHostPort } from "./ports"

/** Bind `host:port` and keep it open; resolves with the server so the test can hold it. */
function occupy(port: number, host = "0.0.0.0"): Promise<Server> {
	return new Promise((resolvePromise, reject) => {
		const server = createServer()
		server.once("error", reject)
		server.listen({ port, host }, () => resolvePromise(server))
	})
}

/** A port that is free *right now* — bind `:0`, read the OS-assigned port, release it. */
async function freePort(host = "0.0.0.0"): Promise<number> {
	const server = await occupy(0, host)
	const { port } = server.address() as AddressInfo
	await new Promise<void>((r) => server.close(() => r()))
	return port
}

/** True when nothing is listening on `host:port` (so `findFreePort` really returned a usable one). */
async function isBindable(port: number, host = "0.0.0.0"): Promise<boolean> {
	try {
		const server = await occupy(port, host)
		await new Promise<void>((r) => server.close(() => r()))
		return true
	} catch {
		return false
	}
}

describe("findFreePort", () => {
	const open: Server[] = []
	afterEach(async () => {
		await Promise.all(open.splice(0).map((server) => new Promise<void>((r) => server.close(() => r()))))
	})

	test("returns the preferred port unchanged when it is free", async () => {
		const preferred = await freePort()
		expect(await findFreePort(preferred)).toBe(preferred)
	})

	test("steps to the next port when the preferred one is taken", async () => {
		const preferred = await freePort()
		open.push(await occupy(preferred))
		expect(await findFreePort(preferred)).toBe(preferred + 1)
	})

	test("skips a run of consecutive busy ports", async () => {
		const preferred = await freePort()
		open.push(await occupy(preferred), await occupy(preferred + 1), await occupy(preferred + 2))
		expect(await findFreePort(preferred)).toBe(preferred + 3)
	})

	test("always returns a port that is actually free to bind", async () => {
		const preferred = await freePort()
		open.push(await occupy(preferred))
		const chosen = await findFreePort(preferred)
		expect(chosen).toBeGreaterThan(preferred)
		expect(await isBindable(chosen)).toBe(true)
	})

	test("honors the host argument (loopback-only probing)", async () => {
		const preferred = await freePort("127.0.0.1")
		open.push(await occupy(preferred, "127.0.0.1"))
		const chosen = await findFreePort(preferred, "127.0.0.1")
		expect(chosen).toBeGreaterThan(preferred)
		expect(await isBindable(chosen, "127.0.0.1")).toBe(true)
	})
})

describe("isFree", () => {
	const open: Server[] = []
	afterEach(async () => {
		await Promise.all(open.splice(0).map((server) => new Promise<void>((r) => server.close(() => r()))))
	})

	test("is true for an unbound port and false for a taken one", async () => {
		const port = await freePort()
		expect(await isFree(port)).toBe(true)
		open.push(await occupy(port))
		expect(await isFree(port)).toBe(false)
	})
})

describe("resolveHostPort", () => {
	const open: Server[] = []
	afterEach(async () => {
		await Promise.all(open.splice(0).map((server) => new Promise<void>((r) => server.close(() => r()))))
	})

	test("a default port (fixed: false) auto-steps past a collision", async () => {
		const preferred = await freePort()
		open.push(await occupy(preferred))
		expect(await resolveHostPort(preferred, { fixed: false })).toBe(preferred + 1)
	})

	test("an explicit port (fixed: true) returns unchanged when free", async () => {
		const preferred = await freePort()
		expect(await resolveHostPort(preferred, { fixed: true })).toBe(preferred)
	})

	test("an explicit port (fixed: true) throws PortInUseError when taken", async () => {
		const preferred = await freePort()
		open.push(await occupy(preferred))
		await expect(resolveHostPort(preferred, { fixed: true })).rejects.toBeInstanceOf(PortInUseError)
	})
})
