import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { ResolvedDevConfig } from "../daemon/config"
import { acquire, isLocked, operationLock, releaseOwned } from "../daemon/lock"
import * as processOwner from "../process-owner"

const mocks = vi.hoisted(() => ({
	config: vi.fn(),
	local: vi.fn(),
	docker: vi.fn(),
	compose: vi.fn(),
	status: vi.fn(),
	running: vi.fn(),
	session: vi.fn(),
}))
vi.mock("../daemon/config", () => ({ resolveDevConfig: mocks.config, usesLocalWordPress: mocks.local }))
vi.mock("./stack", () => ({ devStack: (cfg: unknown) => cfg }))
vi.mock("./session", () => ({ projectSession: mocks.session }))
vi.mock("./docker", () => ({
	docker: mocks.docker,
	dockerStatus: mocks.status,
	dockerHint: () => "Start Docker",
	runningProjectContainers: mocks.running,
	createStack: () => ({ compose: mocks.compose }),
}))

import { endDevSession, exportDev, restoreReadme } from "./export"

let dir: string
let cfg: ResolvedDevConfig
let fail: string | undefined
let calls: string[][]
const ok = (stdout = "") => ({ code: 0, stdout, stderr: "" })

beforeEach(() => {
	vi.clearAllMocks()
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo export '$-"))
	cfg = {
		configDir: dir,
		wordpressDir: path.join(dir, ".kizlo/local"),
		project: "export-test",
		fixtures: [],
	} as unknown as ResolvedDevConfig
	for (const file of ["wp-config.php", "wp-includes/version.php", "wp-content/keep.txt"]) {
		fs.mkdirSync(path.dirname(path.join(cfg.wordpressDir, file)), { recursive: true })
		fs.writeFileSync(path.join(cfg.wordpressDir, file), "original")
	}
	fs.writeFileSync(path.join(dir, ".env"), "PRIVATE=unchanged\n")
	mocks.config.mockResolvedValue(cfg)
	mocks.local.mockResolvedValue(true)
	mocks.status.mockResolvedValue("running")
	mocks.session.mockReturnValue(undefined)
	mocks.running.mockResolvedValue([])
	calls = []
	fail = undefined
	mocks.compose.mockImplementation(async (args: string[]) => {
		calls.push(args)
		return fail && args.includes(fail) ? { code: 1, stdout: "", stderr: "injected failure" } : ok()
	})
	mocks.docker.mockImplementation(async (args: string[]) => {
		calls.push(args)
		if ((fail === "final-shutdown" && args[0] === "stop") || (fail && args.some((arg) => arg.includes(fail as string))))
			return { code: 1, stdout: "", stderr: "injected failure" }
		if (args[0] === "ps") return ok("mysql-container")
		if (args.includes("table_prefix")) return ok("wp_")
		if (args.includes("Read WordPress version") || args.some((arg) => arg.includes("echo $wp_version"))) return ok("7.1")
		if (args.some((arg) => arg.includes("JSON_OBJECT")))
			return ok(
				JSON.stringify({
					database: "8.4",
					prefix: "wp_",
					home: "http://source",
					siteurl: "http://source",
					collations: "utf8mb4_unicode_ci",
				}),
			)
		if (args[0] === "cp" && args[1]?.includes(":")) fs.writeFileSync(args[2] as string, "nonempty fixture")
		return ok()
	})
})

afterEach(() => {
	vi.restoreAllMocks()
	vi.useRealTimers()
	fs.rmSync(dir, { recursive: true, force: true })
})

function exports(): string[] {
	const folder = path.join(dir, ".kizlo/exports")
	return fs.existsSync(folder) ? fs.readdirSync(folder) : []
}

describe("dev export", () => {
	test("exports existing data once, stops web first and publishes only after shutdown", async () => {
		const output = await exportDev(dir)
		expect(path.isAbsolute(output)).toBe(true)
		expect(fs.readFileSync(output, "utf8")).toBe("nonempty fixture")
		expect(exports()).toEqual([path.basename(output)])
		expect(fs.readFileSync(path.join(dir, ".env"), "utf8")).toBe("PRIVATE=unchanged\n")
		expect(fs.readFileSync(path.join(cfg.wordpressDir, "wp-content/keep.txt"), "utf8")).toBe("original")
		expect(calls.findIndex((args) => args[0] === "stop" && args[1] === "wordpress")).toBeLessThan(
			calls.findIndex((args) => args.includes("mysqldump") || args.some((arg) => arg.includes("exec mysqldump"))),
		)
		expect(calls).toContainEqual(["start", "mysql-container"])
		expect(calls.find((args) => args[0] === "run")).toEqual(expect.arrayContaining(["--no-deps", "wp-cli"]))
		expect(calls.some((args) => args.includes("up") || args.includes("down") || args.includes("--databases"))).toBe(false)
		expect(calls.some((args) => args.includes("rm") && args.includes("-f"))).toBe(true)
		await expect(isLocked(operationLock(dir))).resolves.toBe(false)
	})

	test("starts only an existing stopped database and stops it at the end", async () => {
		mocks.running.mockResolvedValueOnce(["mysql-container"]).mockResolvedValueOnce([])
		await exportDev(dir)
		expect(calls).toContainEqual(["stop", "mysql-container"])
		expect(calls.some((args) => args.includes("-v"))).toBe(false)
	})

	test.each(["mysqldump", "export.php", "site.zip", "--no-deps"])(
		"cleans partial output after %s failure and keeps prior exports",
		async (step) => {
			fs.mkdirSync(path.join(dir, ".kizlo/exports"), { recursive: true })
			fs.writeFileSync(path.join(dir, ".kizlo/exports/prior.zip"), "keep")
			fail = step
			await expect(exportDev(dir)).rejects.toThrow("injected failure")
			expect(exports()).toEqual(["prior.zip"])
			await expect(isLocked(operationLock(dir))).resolves.toBe(false)
		},
	)

	test("does not report success or publish when final stack shutdown fails", async () => {
		mocks.running.mockResolvedValue(["mysql-container"])
		fail = "final-shutdown"
		await expect(exportDev(dir)).rejects.toThrow()
		expect(calls.some((args) => args.some((arg) => arg.includes("exec mysqldump")))).toBe(true)
		expect(exports()).toEqual([])
	})

	test("cancellation follows cleanup and never publishes a finished ZIP", async () => {
		const original = mocks.compose.getMockImplementation()
		mocks.compose.mockImplementation(async (args: string[]) => {
			if (args[0] === "run") process.emit("SIGINT")
			return original?.(args)
		})
		await expect(exportDev(dir)).rejects.toThrow("Export interrupted")
		expect(exports()).toEqual([])
		expect(calls.some((args) => args[0] === "rm" && args.includes("-f"))).toBe(true)
	})

	test("rejects conflicting lifecycle operations before touching Docker resources", async () => {
		expect(await acquire(operationLock(dir))).toBe(true)
		await expect(exportDev(dir)).rejects.toThrow("Another dev operation")
		expect(mocks.docker).not.toHaveBeenCalled()
		await releaseOwned(operationLock(dir))
	})

	test("rejects uninitialized sites without starting or stopping services", async () => {
		fs.rmSync(path.join(cfg.wordpressDir, "wp-config.php"))
		await expect(exportDev(dir)).rejects.toThrow("No initialized")
		expect(mocks.docker).not.toHaveBeenCalled()
	})

	test("checks the stopped volume initialization marker before taking control", async () => {
		fail = "auto.cnf"
		await expect(exportDev(dir)).rejects.toThrow("initialized database volume")
		expect(mocks.compose).not.toHaveBeenCalled()
		expect(calls.some((args) => args[0] === "start")).toBe(false)
	})

	test("rejects non-local configuration and unavailable Docker", async () => {
		mocks.local.mockResolvedValueOnce(false)
		await expect(exportDev(dir)).rejects.toThrow("enabled local")
		mocks.status.mockResolvedValueOnce("stopped")
		await expect(exportDev(dir)).rejects.toThrow("Start Docker")
	})

	test("never signals a legacy session or the exporter itself", async () => {
		mocks.session.mockReturnValue({ pid: process.pid })
		await expect(endDevSession(cfg.project, operationLock(dir))).rejects.toThrow("predates export")
		const { currentProcessOwner } = await import("../process-owner")
		mocks.session.mockReturnValue({ ...(await currentProcessOwner()), operationFile: operationLock(dir) })
		await expect(endDevSession(cfg.project, operationLock(dir))).rejects.toThrow("inside the foreground")
	})

	test("README separates phpMyAdmin import from URL replacement and preserves metadata", () => {
		const readme = restoreReadme({
			wordpress: "7.1",
			database: "8.4",
			prefix: "custom_",
			home: "http://source",
			siteurl: "http://source/wp",
			collations: "utf8mb4_0900_ai_ci",
		})
		expect(readme).toContain("Keep database.sql.zip compressed")
		expect(readme).toContain("Table prefix: custom_")
		expect(readme).toContain("utf8mb4_0900_ai_ci")
		expect(readme).toContain("--dry-run")
		expect(readme).toContain("upload_max_filesize")
	})
})

describe("verified foreground shutdown", () => {
	test("retries a busy identity before signalling and confirms exit afterward", async () => {
		const session = { pid: 1234, port: 5678, token: "verified", operationFile: operationLock(dir) }
		mocks.session.mockReturnValue(session)
		const status = vi
			.spyOn(processOwner, "ownerStatus")
			.mockResolvedValueOnce("unknown")
			.mockResolvedValueOnce("alive")
			.mockResolvedValueOnce("unknown")
			.mockResolvedValueOnce("dead")
		const kill = vi.spyOn(process, "kill").mockReturnValue(true)
		const pending = endDevSession(cfg.project, operationLock(dir))
		const verified = expect(pending).resolves.toBeUndefined()
		await verified
		expect(status).toHaveBeenCalledTimes(4)
		expect(kill).toHaveBeenCalledExactlyOnceWith(1234, "SIGTERM")
	})
	test("a real busy owner survives abandoned probes and shuts down gracefully", async () => {
		const { spawn } = await import("node:child_process")
		const { fileURLToPath, pathToFileURL } = await import("node:url")
		const { transpileModule, ModuleKind, ScriptTarget } = await import("typescript")
		const source = fs.readFileSync(fileURLToPath(new URL("../process-owner.ts", import.meta.url)), "utf8")
		const module = path.join(dir, "process-owner.mjs")
		fs.writeFileSync(
			module,
			transpileModule(source, { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 } }).outputText,
		)
		const code = `import {currentProcessOwner} from ${JSON.stringify(pathToFileURL(module).href)};
 process.on('SIGTERM',()=>{process.send('graceful');process.exit(0)});
 process.once('message',()=>{process.send('busy');const until=Date.now()+2200;while(Date.now()<until){}});
 process.send(await currentProcessOwner());setInterval(()=>{},1000);`
		const child = spawn(process.execPath, ["--input-type=module", "-e", code], { stdio: ["ignore", "ignore", "pipe", "ipc"] })
		const exit = new Promise<number | null>((resolve, reject) => {
			child.once("exit", resolve)
			child.once("error", reject)
		})
		const message = (): Promise<unknown> => new Promise((resolve) => child.once("message", resolve))
		let graceful = false
		child.on("message", (message: unknown) => {
			if (message === "graceful") graceful = true
		})
		try {
			const owner = (await message()) as processOwner.ProcessOwner
			mocks.session.mockReturnValue({ ...owner, operationFile: operationLock(dir) })
			const busy = message()
			child.send("block")
			await busy
			await endDevSession(cfg.project, operationLock(dir))
			const code = await exit
			expect(code).toBe(0)
			expect(graceful).toBe(true)
		} finally {
			if (child.exitCode === null && child.signalCode === null) child.kill()
			await exit
		}
	})

	test("fails export without publication if a live owner's identity stays unknown", async () => {
		await processOwner.currentProcessOwner()
		let now = 0
		vi.spyOn(Date, "now").mockImplementation(() => (now += 2_500))
		mocks.session.mockReturnValue({ pid: 1234, port: 5678, token: "busy", operationFile: operationLock(dir) })
		vi.spyOn(processOwner, "ownerStatus").mockResolvedValue("unknown")
		const kill = vi.spyOn(process, "kill").mockReturnValue(true)
		const pending = exportDev(dir)
		const failure = expect(pending).rejects.toThrow("Could not confirm dev session shutdown")
		await failure
		expect(kill).not.toHaveBeenCalled()
		expect(exports()).toEqual([])
		expect(fs.existsSync(operationLock(dir))).toBe(false)
	})
	test("does not signal a PID whose token proves it belongs to a different process", async () => {
		mocks.session.mockReturnValue({ pid: 1234, port: 5678, token: "old", operationFile: operationLock(dir) })
		vi.spyOn(processOwner, "ownerStatus").mockResolvedValue("dead")
		const kill = vi.spyOn(process, "kill").mockReturnValue(true)
		await endDevSession(cfg.project, operationLock(dir))
		expect(kill).not.toHaveBeenCalled()
	})
})
