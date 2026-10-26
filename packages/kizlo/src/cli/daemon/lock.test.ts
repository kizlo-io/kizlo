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

describe("operation ownership", () => {
	test("does not release a replacement owner's lock", async () => {
		const { releaseOwned } = await import("./lock")
		await acquire(file)
		fs.writeFileSync(file, JSON.stringify({ ...owner(), token: "replacement" }))
		await releaseOwned(file)
		expect(owner().token).toBe("replacement")
	})

	test("serializes lifecycle operations and releases on failure", async () => {
		const { withOperation, operationLock } = await import("./lock")
		await expect(
			withOperation(cwd, async () => {
				await expect(withOperation(cwd, async () => {})).rejects.toThrow("Another dev")
				throw new Error("failed operation")
			}),
		).rejects.toThrow("failed operation")
		await expect(isLocked(operationLock(cwd))).resolves.toBe(false)
	})
})

describe("stale lock recovery", () => {
	test("never replaces a lock that changed during its owner probe", async () => {
		const { createServer } = await import("node:net")
		const { currentProcessOwner } = await import("../process-owner")
		const replacement = await currentProcessOwner()
		const server = createServer((socket) => {
			fs.writeFileSync(file, JSON.stringify(replacement))
			socket.end("different-token")
		})
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
		try {
			const address = server.address()
			if (!address || typeof address === "string") throw new Error("Missing test probe")
			fs.mkdirSync(path.dirname(file), { recursive: true })
			fs.writeFileSync(file, JSON.stringify({ pid: process.pid, port: address.port, token: "stale" }))
			expect(await acquire(file)).toBe(false)
			expect(owner()).toEqual(replacement)
		} finally {
			server.close()
		}
	})

	test("does not reclaim an operation lock when its live owner misses a probe", async () => {
		const { createServer } = await import("node:net")
		const sockets: import("node:net").Socket[] = []
		const server = createServer((socket) => {
			sockets.push(socket)
		})
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
		try {
			const address = server.address()
			if (!address || typeof address === "string") throw new Error("Missing test endpoint")
			fs.mkdirSync(path.dirname(file), { recursive: true })
			const record = JSON.stringify({ pid: process.pid, port: address.port, token: "busy" })
			fs.writeFileSync(file, record)
			expect(await acquire(file)).toBe(false)
			expect(fs.readFileSync(file, "utf8")).toBe(record)
		} finally {
			for (const socket of sockets) socket.destroy()
			server.close()
		}
	})

	test("fails safely when an earlier recovery was interrupted", async () => {
		const pid = deadPid()
		held(pid)
		fs.mkdirSync(`${file}.reclaim`)
		await expect(acquire(file)).rejects.toThrow("stop this project's dev commands and remove")
		expect(fs.readFileSync(file, "utf8")).toBe(String(pid))
	})

	test("two processes recovering the same stale lock cannot both own it", async () => {
		const { spawn } = await import("node:child_process")
		const { createServer } = await import("node:net")
		const { fileURLToPath, pathToFileURL } = await import("node:url")
		const { transpileModule, ModuleKind, ScriptTarget } = await import("typescript")
		for (const [source, target] of [
			["./lock.ts", "lock.mjs"],
			["../process-owner.ts", "process-owner.mjs"],
		] as const) {
			const text = fs
				.readFileSync(fileURLToPath(new URL(source, import.meta.url)), "utf8")
				.replace('"../process-owner"', '"./process-owner.mjs"')
			fs.writeFileSync(
				path.join(cwd, target),
				transpileModule(text, { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 } }).outputText,
			)
		}
		const sockets: import("node:net").Socket[] = []
		const server = createServer((socket) => {
			sockets.push(socket)
			if (sockets.length === 2) {
				sockets[0]?.end("different-token")
				setTimeout(() => sockets[1]?.end("different-token"), 150)
			}
		})
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
		const address = server.address()
		if (!address || typeof address === "string") throw new Error("Missing test probe")
		fs.mkdirSync(path.dirname(file), { recursive: true })
		fs.writeFileSync(file, JSON.stringify({ pid: process.pid, port: address.port, token: "stale" }))
		const code = `import {acquire,releaseOwned} from ${JSON.stringify(pathToFileURL(path.join(cwd, "lock.mjs")).href)};
process.once('message',async()=>{
 const won=await acquire(${JSON.stringify(file)});
 process.send({won});
 if(won) { await new Promise(r=>setTimeout(r,500)); await releaseOwned(${JSON.stringify(file)}); }
 process.disconnect();
});
process.send('ready');`
		const children = Array.from({ length: 2 }, () =>
			spawn(process.execPath, ["--input-type=module", "-e", code], { stdio: ["ignore", "ignore", "pipe", "ipc"] }),
		)
		try {
			const results = children.map(
				(child) =>
					new Promise<boolean>((resolve, reject) => {
						child.on("message", (message: unknown) => {
							if (typeof message === "object" && message && "won" in message) resolve(message.won === true)
						})
						child.on("error", reject)
						child.on("exit", (code) => {
							if (code !== 0) reject(new Error(`Lock contender exited ${code}`))
						})
					}),
			)
			await Promise.all(children.map((child) => new Promise<void>((resolve) => child.once("message", () => resolve()))))
			for (const child of children) child.send("go")
			expect((await Promise.all(results)).filter(Boolean)).toHaveLength(1)
		} finally {
			for (const child of children) child.kill()
			for (const socket of sockets) socket.destroy()
			server.close()
		}
	})
})
