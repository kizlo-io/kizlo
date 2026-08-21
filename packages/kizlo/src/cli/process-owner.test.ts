import { describe, expect, test } from "vitest"
import { currentProcessOwner, ownerAlive } from "./process-owner"

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
