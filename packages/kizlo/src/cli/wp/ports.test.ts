import { type AddressInfo, createServer, type Server } from "node:net"
import { afterEach, describe, expect, test } from "vitest"
import { findFreePort, isFree, PORT_SCAN_RANGE, PortInUseError, resolveHostPort } from "./ports"

/** Every port reserved by the running test, released once it ends. */
const open: Server[] = []

afterEach(async () => {
	await Promise.all(open.splice(0).map(release))
})

/** Bind `host:port` and keep it open; resolves with the server so the test can hold it. */
function occupy(port: number, host = "0.0.0.0"): Promise<Server> {
	return new Promise((resolvePromise, reject) => {
		const server = createServer()
		server.once("error", reject)
		server.listen({ port, host }, () => resolvePromise(server))
	})
}

function release(server: Server): Promise<void> {
	return new Promise((resolvePromise) => server.close(() => resolvePromise()))
}

/** A port that is free *right now* — bind `:0`, read the OS-assigned port, release it. */
async function freePort(host = "0.0.0.0"): Promise<number> {
	const server = await occupy(0, host)
	const { port } = server.address() as AddressInfo
	await release(server)
	return port
}

/** True when nothing is listening on `host:port` (so `findFreePort` really returned a usable one). */
async function isBindable(port: number, host = "0.0.0.0"): Promise<boolean> {
	try {
		await release(await occupy(port, host))
		return true
	} catch {
		return false
	}
}

/**
 * Hold `count` consecutive ports for the rest of the test, so nothing an assertion reasons about
 * can be taken by an unrelated process mid-run. A base whose run is only partly bindable is
 * released and retried rather than asserted against — that partial hold is the whole flake.
 */
async function occupyRun(count: number, host = "0.0.0.0"): Promise<{ first: number; last: number }> {
	for (let attempt = 0; attempt < 20; attempt++) {
		const first = await freePort(host)
		const servers: Server[] = []
		for (let port = first; port < first + count; port++) {
			const server = await occupy(port, host).catch(() => undefined)
			if (!server) break
			servers.push(server)
		}
		if (servers.length === count) {
			open.push(...servers)
			return { first, last: first + count - 1 }
		}
		await Promise.all(servers.map(release))
	}
	throw new Error(`Could not reserve ${count} consecutive ports on ${host}`)
}

/**
 * Assert `condition`, unless the port it reasons about was taken by something outside the test.
 * A port the picker is expected to *return* is the one port a test cannot reserve — holding it
 * would make it busy — so a mismatch is a bug only when the port was still there for the taking.
 */
async function expectUnlessTaken(condition: boolean, port: number, host = "0.0.0.0"): Promise<void> {
	if (condition) return
	expect(await isBindable(port, host)).toBe(false)
}

describe("findFreePort", () => {
	test("returns the preferred port unchanged when it is free", async () => {
		const preferred = await freePort()
		const chosen = await findFreePort(preferred)
		await expectUnlessTaken(chosen === preferred, preferred)
	})

	test("steps past the preferred port when it is taken", async () => {
		const { first, last } = await occupyRun(1)
		const chosen = await findFreePort(first)
		expect(chosen).toBeGreaterThan(last)
		expect(await isBindable(chosen)).toBe(true)
	})

	test("skips a run of consecutive busy ports", async () => {
		const { first, last } = await occupyRun(3)
		const chosen = await findFreePort(first)
		expect(chosen).toBeGreaterThan(last)
		expect(await isBindable(chosen)).toBe(true)
	})

	test("honors the host argument (loopback-only probing)", async () => {
		const { first, last } = await occupyRun(1, "127.0.0.1")
		const chosen = await findFreePort(first, "127.0.0.1")
		expect(chosen).toBeGreaterThan(last)
		expect(await isBindable(chosen, "127.0.0.1")).toBe(true)
	})

	test("falls back to an ephemeral port when the whole scan range is busy", async () => {
		const { first, last } = await occupyRun(PORT_SCAN_RANGE)
		const chosen = await findFreePort(first)
		expect(chosen >= first && chosen <= last).toBe(false)
		expect(await isBindable(chosen)).toBe(true)
	})
})

describe("isFree", () => {
	test("is false while a port is held", async () => {
		const { first } = await occupyRun(1)
		expect(await isFree(first)).toBe(false)
	})

	test("is true for a port nothing is listening on", async () => {
		const port = await freePort()
		await expectUnlessTaken(await isFree(port), port)
	})
})

describe("resolveHostPort", () => {
	test("a default port (fixed: false) auto-steps past a collision", async () => {
		const { first, last } = await occupyRun(1)
		const chosen = await resolveHostPort(first, { fixed: false })
		expect(chosen).toBeGreaterThan(last)
		expect(await isBindable(chosen)).toBe(true)
	})

	test("an explicit port (fixed: true) returns unchanged when free", async () => {
		const preferred = await freePort()
		const resolved = await resolveHostPort(preferred, { fixed: true }).catch(() => undefined)
		await expectUnlessTaken(resolved === preferred, preferred)
	})

	test("an explicit port (fixed: true) throws PortInUseError when taken", async () => {
		const { first } = await occupyRun(1)
		await expect(resolveHostPort(first, { fixed: true })).rejects.toBeInstanceOf(PortInUseError)
	})
})
