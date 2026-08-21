import { spawn } from "node:child_process"
import { createReadStream } from "node:fs"

/**
 * Options for a spawned docker command.
 * - `input`/`inputFile`: data piped to stdin (an in-memory string, or a file streamed from disk).
 * - `detached`: run in its own process group so a terminal Ctrl+C (delivered to the whole
 *   foreground group) can't kill it mid-flight — used for teardown's `stop`, which must finish.
 */
type RunInput = { input?: string; inputFile?: string; detached?: boolean }

/** A docker-compose stack: project id (`-p`), published port, image tag, and compose files (`-f`). */
export interface Stack {
	/** Compose project name — isolates this stack's containers + volumes. */
	project: string
	/** Host port published for WordPress (exported as `WP_PORT`). */
	port: number
	/** WordPress image tag this stack boots, `wordpress:<tag>` (exported as `WP_IMAGE_TAG`). */
	wordpressTag: string
	/** Compose files, base first then any generated override. */
	composeFiles: string[]
}

/** Stack-bound docker helpers. */
export interface DockerStack {
	compose(args: string[], opts?: RunInput): Promise<RunResult>
	/** Pull the named services' images (all when omitted), refreshing a cached tag that moves, like `latest`. */
	composePull(services?: string[]): Promise<RunResult>
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
		if (opts?.inputFile !== undefined) createReadStream(opts.inputFile).on("error", reject).pipe(child.stdin)
		else if (opts?.input !== undefined) child.stdin.end(opts.input)
		else child.stdin.end()
	})
}

/**
 * Docker's readiness in three states, so callers can tell "not installed" from "installed but not
 * running" and say the right thing:
 * - `missing` — the `docker` binary isn't on PATH (`docker --version` errors).
 * - `stopped` — the client is installed but the daemon is unreachable (`docker version` fails).
 * - `running` — the daemon answered, so a stack can boot.
 */
export type DockerStatus = "missing" | "stopped" | "running"

/**
 * Probe Docker in two steps: `docker --version` only touches the client (is it installed?), then
 * `docker version` contacts the server (is the daemon up?). Used before any command that needs local
 * WordPress, so the caller can distinguish an install problem from a "start Docker" problem.
 */
export async function dockerStatus(): Promise<DockerStatus> {
	try {
		const installed = await run("docker", ["--version"], process.env)
		if (installed.code !== 0) return "missing"
	} catch {
		return "missing"
	}
	try {
		const daemon = await run("docker", ["version"], process.env)
		return daemon.code === 0 ? "running" : "stopped"
	} catch {
		return "stopped"
	}
}

/** The one-line fix to print when Docker isn't ready — install it, or start the daemon. */
export function dockerHint(status: "missing" | "stopped"): string {
	return status === "missing"
		? "Docker isn't installed. Install it from https://docs.docker.com/get-docker/, then re-run."
		: "Docker is installed but not running. Start Docker (Docker Desktop, or `sudo systemctl start docker`) and re-run."
}

/** Whether the Docker daemon is reachable — the early check before a command that needs a stack. */
export async function dockerAvailable(): Promise<boolean> {
	return (await dockerStatus()) === "running"
}

/**
 * The running container ids for a compose project, found by label rather than through compose, so
 * this works from any directory and without the project's compose files. Throws when docker itself
 * could not answer, which the callers tell apart from an empty answer.
 */
export async function runningProjectContainers(project: string): Promise<string[]> {
	const res = await run("docker", ["ps", "-q", "--filter", `label=com.docker.compose.project=${project}`], process.env)
	if (res.code !== 0) throw new Error(`docker ps failed:\n${res.stderr || res.stdout}`)
	return res.stdout.split("\n").filter(Boolean)
}

/**
 * Stop every running container for a compose project, targeted by label so this needs neither the
 * project's compose files nor its directory. Both are out of reach for a stack whose owning session
 * is gone, which is the case this exists for.
 */
export async function stopProjectContainers(project: string): Promise<void> {
	const ids = await runningProjectContainers(project)
	if (!ids.length) return
	const res = await run("docker", ["stop", ...ids], process.env)
	if (res.code !== 0) throw new Error(`docker stop failed:\n${res.stderr || res.stdout}`)
}

/**
 * Whether a stack is still up, in the three answers a caller acting on it needs:
 * - `running` — at least one of the project's containers is up.
 * - `stopped` — none are, or the daemon that would run them is itself gone. Both mean the stack is
 *   not serving, and a daemon that is down cannot be hiding a running container.
 * - `unknown` — the daemon is up but the query failed, so this is no evidence either way. Callers
 *   retry rather than act, because acting on it would end a session over a flaked subprocess.
 */
export type StackStatus = "running" | "stopped" | "unknown"

export async function stackStatus(project: string): Promise<StackStatus> {
	try {
		return (await runningProjectContainers(project)).length ? "running" : "stopped"
	} catch {
		return (await dockerStatus()) === "running" ? "unknown" : "stopped"
	}
}

function bind(stack: Stack): DockerStack {
	const base = ["compose", "-p", stack.project, ...stack.composeFiles.flatMap((file) => ["-f", file])]
	const env = { ...process.env, WP_PORT: String(stack.port), WP_IMAGE_TAG: stack.wordpressTag }

	const compose: DockerStack["compose"] = (args, opts) => run("docker", [...base, ...args], env, opts)

	const composePull: DockerStack["composePull"] = (services = []) => compose(["pull", ...services])

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

	return { compose, composePull, composeUp, composeStop, composeDown, publishedPort, wpCli }
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

/** `docker compose <args>` against the active stack. */
export const compose: DockerStack["compose"] = (args, opts) => activeStack().compose(args, opts)

/** Pull the latest images for the active stack's named services (all when omitted). */
export const composePull = (services?: string[]): Promise<RunResult> => activeStack().composePull(services)

/** Bring the active stack's services up detached and wait for health checks. */
export const composeUp = (): Promise<void> => activeStack().composeUp()

/** Tear the active stack down, optionally removing volumes. */
export const composeDown = (opts?: { volumes?: boolean }): Promise<void> => activeStack().composeDown(opts)

/** `docker compose stop` — halt the active stack's containers but keep volumes. */
export const composeStop = (opts?: { detached?: boolean }): Promise<void> => activeStack().composeStop(opts)

/** Run a wp-cli command against the active stack's warm `wp-cli` container. */
export const wpCli = (args: string[]): Promise<string> => activeStack().wpCli(args)

/** Run PHP inside the active stack's loaded WordPress. */
export const wpEval = (php: string): Promise<string> => wpCli(["eval", php])
