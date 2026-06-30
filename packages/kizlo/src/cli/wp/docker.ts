import { spawn } from "node:child_process"
import { createReadStream } from "node:fs"

/**
 * Options for a spawned docker command.
 * - `input`/`inputFile`: data piped to stdin (an in-memory string, or a file streamed from disk).
 * - `detached`: run in its own process group so a terminal Ctrl+C (delivered to the whole
 *   foreground group) can't kill it mid-flight — used for teardown's `stop`, which must finish.
 */
type RunInput = { input?: string; inputFile?: string; detached?: boolean }

/** A docker-compose stack: project id (`-p`), published port, and compose files (`-f`). */
export interface Stack {
	/** Compose project name — isolates this stack's containers + volumes. */
	project: string
	/** Host port published for WordPress (exported as `WP_PORT`). */
	port: number
	/** Compose files, base first then any generated override. */
	composeFiles: string[]
}

/** Stack-bound docker helpers. */
export interface DockerStack {
	compose(args: string[], opts?: RunInput): Promise<RunResult>
	composeUp(): Promise<void>
	composeStop(opts?: { detached?: boolean }): Promise<void>
	composeDown(opts?: { volumes?: boolean }): Promise<void>
	/** The host port this stack's WordPress is currently published on, or `undefined` if it isn't running. */
	publishedPort(): Promise<number | undefined>
	wpCli(args: string[]): Promise<string>
}

export interface RunResult {
	code: number
	stdout: string
	stderr: string
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv, opts?: RunInput): Promise<RunResult> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], env, detached: opts?.detached })
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
		// Stream a file (avoids loading a large DB dump into memory), else a string, else nothing.
		if (opts?.inputFile !== undefined) createReadStream(opts.inputFile).on("error", reject).pipe(child.stdin)
		else if (opts?.input !== undefined) child.stdin.end(opts.input)
		else child.stdin.end()
	})
}

/**
 * Whether the Docker daemon is reachable. `docker version` contacts the server (not just
 * the client), so a non-zero exit means the daemon is down or Docker isn't installed —
 * the early check before a command that needs a stack (e.g. `init`'s local setup).
 */
export async function dockerAvailable(): Promise<boolean> {
	try {
		const res = await run("docker", ["version"], process.env)
		return res.code === 0
	} catch {
		return false
	}
}

function bind(stack: Stack): DockerStack {
	const base = ["compose", "-p", stack.project, ...stack.composeFiles.flatMap((file) => ["-f", file])]
	const env = { ...process.env, WP_PORT: String(stack.port) }

	const compose: DockerStack["compose"] = (args, opts) => run("docker", [...base, ...args], env, opts)

	const composeUp = async (): Promise<void> => {
		const res = await compose(["up", "-d", "--wait"])
		if (res.code !== 0) throw new Error(`docker compose up failed:\n${res.stderr}`)
	}

	const composeDown = async (opts?: { volumes?: boolean }): Promise<void> => {
		const args = ["down"]
		if (opts?.volumes) args.push("-v")
		await compose(args)
	}

	const composeStop = async (opts?: { detached?: boolean }): Promise<void> => {
		await compose(["stop"], opts)
	}

	// `docker compose port wordpress 80` prints `0.0.0.0:<port>` when the container is up,
	// nothing when it isn't — so a parsed port doubles as "this stack is running". Tells a
	// warm stack we should reuse apart from a cold one we must (re)pick a port for.
	const publishedPort = async (): Promise<number | undefined> => {
		const res = await compose(["port", "wordpress", "80"])
		const match = res.stdout.match(/:(\d+)\s*$/)
		return match ? Number(match[1]) : undefined
	}

	const wpCli = async (args: string[]): Promise<string> => {
		const res = await compose(["exec", "-T", "wp-cli", "wp", ...args])
		if (res.code !== 0) {
			throw new Error(`wp ${args.join(" ")} failed:\n${res.stderr || res.stdout}`)
		}
		return res.stdout.replace(/\r/g, "").trim()
	}

	return { compose, composeUp, composeStop, composeDown, publishedPort, wpCli }
}

/**
 * The stack the module-level helpers target. `createStack` sets it so fixtures —
 * which call the public `wpCli`/`compose` with no stack — hit whatever stack the
 * running command activated (the test stack during seeding).
 */
let active: Stack | null = null

/** Build a stack-bound docker helper and mark it active for the bare helpers below. */
export function createStack(stack: Stack): DockerStack {
	active = stack
	return bind(stack)
}

function activeStack(): DockerStack {
	if (!active) throw new Error("No active kizlo stack — createStack() must run first.")
	return bind(active)
}

// Stack-less helpers retained for fixtures (kizlo/test). They target the active
// stack, which the running command set via createStack.

/** `docker compose <args>` against the active stack. */
export const compose: DockerStack["compose"] = (args, opts) => activeStack().compose(args, opts)

/** Bring the active stack's services up detached and wait for health checks. */
export const composeUp = (): Promise<void> => activeStack().composeUp()

/** Tear the active stack down, optionally removing volumes. */
export const composeDown = (opts?: { volumes?: boolean }): Promise<void> => activeStack().composeDown(opts)

/** `docker compose stop` — halt the active stack's containers but keep volumes. */
export const composeStop = (opts?: { detached?: boolean }): Promise<void> => activeStack().composeStop(opts)

/** Run a wp-cli command against the active stack's warm `wp-cli` container. */
export const wpCli = (args: string[]): Promise<string> => activeStack().wpCli(args)
