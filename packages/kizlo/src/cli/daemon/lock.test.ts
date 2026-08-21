import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { acquire, lockPath, release } from "./lock"

function workspace(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-lock-"))
}

/** A pid no process holds, so a lock recording it reads as one its owner left behind. */
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

/** A lock file already on disk, owned by `pid`, the way another daemon would have left it. */
function held(file: string, pid: number): void {
	fs.mkdirSync(path.dirname(file), { recursive: true })
	fs.writeFileSync(file, String(pid))
}

describe("acquire", () => {
	test("takes a free lock and records this process", () => {
		const file = lockPath(workspace())

		expect(acquire(file)).toBe(true)
		expect(fs.readFileSync(file, "utf8")).toBe(String(process.pid))
	})

	test("refuses a lock a live process already holds", () => {
		const file = lockPath(workspace())
		held(file, process.pid)

		expect(acquire(file)).toBe(false)
	})

	test("takes over a lock whose owner is gone", () => {
		const file = lockPath(workspace())
		held(file, deadPid())

		expect(acquire(file)).toBe(true)
		expect(fs.readFileSync(file, "utf8")).toBe(String(process.pid))
	})

	test("takes over a lock holding no readable pid", () => {
		const file = lockPath(workspace())
		held(file, Number.NaN)

		expect(acquire(file)).toBe(true)
	})

	test("lets the next caller in once the lock is released", () => {
		const file = lockPath(workspace())

		expect(acquire(file)).toBe(true)
		expect(acquire(file)).toBe(false)
		release(file)
		expect(acquire(file)).toBe(true)
	})
})
