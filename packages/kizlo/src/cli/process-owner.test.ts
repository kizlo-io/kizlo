import { describe, expect, test } from "vitest"
import { currentProcessOwner, ownerAlive, ownerStatus } from "./process-owner"

describe("process owner liveness", () => {
	test("recognises the process serving the recorded token", async () => {
		const owner = await currentProcessOwner()

		await expect(ownerAlive(owner)).resolves.toBe(true)
	})

	test("rejects a recycled PID when its liveness token does not match", async () => {
		const owner = await currentProcessOwner()

		await expect(ownerAlive({ ...owner, token: "a-different-process" })).resolves.toBe(false)
	})

	test("reads PID-only records written before liveness tokens", async () => {
		await expect(ownerAlive({ pid: process.pid })).resolves.toBe(true)
		await expect(ownerAlive({ pid: Number.MAX_SAFE_INTEGER })).resolves.toBe(false)
	})
})

test("a live PID with an unresponsive identity endpoint is unknown", async () => {
	const { createServer } = await import("node:net")
	const sockets: import("node:net").Socket[] = []
	const server = createServer((socket) => {
		sockets.push(socket)
	})
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
	try {
		const address = server.address()
		if (!address || typeof address === "string") throw new Error("Missing test endpoint")
		expect(await ownerStatus({ pid: process.pid, port: address.port, token: "busy" })).toBe("unknown")
	} finally {
		for (const socket of sockets) socket.destroy()
		server.close()
	}
})
