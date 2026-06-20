import { spawn } from "node:child_process"
import { COMPOSE } from "./constants"

interface RunResult {
	code: number
	stdout: string
	stderr: string
}

function run(cmd: string, args: string[], opts?: { input?: string }): Promise<RunResult> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] })
		let stdout = ""
		let stderr = ""
		child.stdout.on("data", (d) => {
			stdout += d
		})
		child.stderr.on("data", (d) => {
			stderr += d
		})
		child.on("error", reject)
		child.on("close", (code) => resolvePromise({ code: code ?? 0, stdout, stderr }))
		if (opts?.input !== undefined) child.stdin.end(opts.input)
		else child.stdin.end()
	})
}

/** `docker compose <args>` against the harness compose file. */
export async function compose(args: string[], opts?: { input?: string }): Promise<RunResult> {
	return run("docker", [...COMPOSE, ...args], opts)
}

/** Bring services up detached and wait for health checks. */
export async function composeUp(): Promise<void> {
	const res = await compose(["up", "-d", "--wait"])
	if (res.code !== 0) throw new Error(`docker compose up failed:\n${res.stderr}`)
}

/** Tear everything down, optionally removing volumes. */
export async function composeDown(opts?: { volumes?: boolean }): Promise<void> {
	const args = ["down"]
	if (opts?.volumes) args.push("-v")
	await compose(args)
}

/** `docker compose stop` — halt containers but keep volumes (DB intact). */
export async function composeStop(): Promise<void> {
	await compose(["stop"])
}

/**
 * Run a wp-cli command against the warm `wp-cli` container and return trimmed stdout.
 */
export async function wpCli(args: string[]): Promise<string> {
	const res = await compose(["exec", "-T", "wp-cli", "wp", ...args])
	if (res.code !== 0) {
		throw new Error(`wp ${args.join(" ")} failed:\n${res.stderr || res.stdout}`)
	}
	return res.stdout.replace(/\r/g, "").trim()
}
