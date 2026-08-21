import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import type { ProcessOwner } from "../process-owner"
import { acquire, isLocked, lockPath, release } from "./lock"

let cwd: string
let file: string

beforeEach(() => {
	cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-lock-"))
	file = lockPath(cwd)
})

afterEach(() => {
	fs.rmSync(cwd, { recursive: true, force: true })
})

/** A PID no process holds, so a lock recording it reads as one its owner left behind. */
function deadPid(): number {
	for (let pid = 99_999; pid > 1; pid--) {
		try {
			process.kill(pid, 0)
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ESRCH") return pid
		}
	}
	throw new Error("no dead pid to test with")
}

/** A legacy lock file already on disk, owned by `pid`. */
function held(pid: number): void {
	fs.mkdirSync(path.dirname(file), { recursive: true })
	fs.writeFileSync(file, String(pid))
}

function owner(): ProcessOwner {
	return JSON.parse(fs.readFileSync(file, "utf8")) as ProcessOwner
}

describe("acquire", () => {
	test("takes a free lock and records this process identity", async () => {
		expect(await acquire(file)).toBe(true)
		expect(owner().pid).toBe(process.pid)
		await expect(isLocked(file)).resolves.toBe(true)
	})

	test("refuses a lock a live process already holds", async () => {
		expect(await acquire(file)).toBe(true)
		expect(await acquire(file)).toBe(false)
	})

	test("takes over a lock whose owner is gone", async () => {
		held(deadPid())

		expect(await acquire(file)).toBe(true)
		expect(owner().pid).toBe(process.pid)
	})

	test("takes over a lock holding no readable PID", async () => {
		held(Number.NaN)

		expect(await acquire(file)).toBe(true)
	})

	test("lets the next caller in once the lock is released", async () => {
		expect(await acquire(file)).toBe(true)
		expect(await acquire(file)).toBe(false)
		release(file)
		expect(await acquire(file)).toBe(true)
	})

	test("takes over a stale lock when another process has reused its PID", async () => {
		expect(await acquire(file)).toBe(true)
		fs.writeFileSync(file, JSON.stringify({ ...owner(), token: "a-different-process" }))

		await expect(isLocked(file)).resolves.toBe(false)
		expect(await acquire(file)).toBe(true)
		await expect(isLocked(file)).resolves.toBe(true)
	})

	test("reads PID-only locks written by older Kizlo versions", async () => {
		held(process.pid)

		await expect(isLocked(file)).resolves.toBe(true)
	})
})
