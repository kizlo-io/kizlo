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

/**
 * How long `composeUp` waits for every service to report healthy. The `wordpress` probe's own
 * verdict lands anywhere from ~330s (a 30s start period, then 60 retries 5s apart) to ~630s when
 * every attempt burns its full 5s timeout, so this cap sits inside that range on purpose: a stack
 * that is still coming up is never cut off, while one that will never converge is reported at
 * roughly six minutes rather than eleven. Past the cap the error names each service's state at that
 * moment instead of the healthcheck's final verdict, which is the trade this bound accepts.
 */
const WAIT_TIMEOUT_SECONDS = 360

/** Cap on a healthcheck's reported output; docker keeps up to 4 KB per probe, far more than reads. */
const PROBE_OUTPUT_LIMIT = 500

/** A container as `docker compose ps --format json` reports it. */
interface ComposeContainer {
	Name: string
	Service: string
	State: string
	/** Empty for a service that declares no healthcheck, and optional because not every build prints it. */
	Health?: string
}

/**
 * Compose's per-resource progress chatter, which it writes to stderr even when the command works:
 * `Container x Created`, `Volume y Removed`. A failed `up --wait` buries its real message under a
 * dozen of these, so they are dropped and the lines that say what went wrong survive: `Container x
 * Error …`, `dependency failed to start: …`, a denied mount. An unrecognised verb just costs one
 * noise line, and anything carrying trailing text is kept, so this can only under-filter.
 */
const COMPOSE_PROGRESS_LINE =
	/^(?:Container|Network|Volume|Image)\s+\S+\s+(?:Creating|Created|Recreate|Recreated|Starting|Started|Stopping|Stopped|Removing|Removed|Waiting|Healthy|Running|Pulling|Pulled|Building|Built|Skipped)$/

/** Docker's own message for a failed command, with its progress chatter removed. */
function dockerMessage(res: RunResult): string {
	return (res.stderr || res.stdout)
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "" && !COMPOSE_PROGRESS_LINE.test(line))
		.join("\n")
}

/** The health docker keeps per container, including a rolling log of probe results. */
interface ContainerHealth {
	Status: string
	FailingStreak: number
	Log: { ExitCode: number; Output: string }[]
}

/**
 * Whether compose reports a container's healthcheck as passing, or as having none to report. The
 * field is empty for a service without a healthcheck and absent altogether on some compose builds,
 * and neither is a failure, so both read as healthy here.
 */
function isHealthy(health: string | undefined): boolean {
	return !health || health === "healthy"
}

/** Containers from `compose ps --format json`: one object per line, or a single array on older builds. */
function parseComposePs(stdout: string): ComposeContainer[] {
	const trimmed = stdout.trim()
	if (!trimmed) return []
	return (trimmed.startsWith("[") ? [trimmed] : trimmed.split("\n")).flatMap((chunk) => {
		try {
			const parsed: unknown = JSON.parse(chunk)
			return (Array.isArray(parsed) ? parsed : [parsed]) as ComposeContainer[]
		} catch {
			return []
		}
	})
}

function bind(stack: Stack): DockerStack {
	const base = ["compose", "-p", stack.project, ...stack.composeFiles.flatMap((file) => ["-f", file])]
	const env = { ...process.env, WP_PORT: String(stack.port), WP_IMAGE_TAG: stack.wordpressTag }

	const compose: DockerStack["compose"] = (args, opts) => run("docker", [...base, ...args], env, opts)

	const composePull: DockerStack["composePull"] = (services = []) => compose(["pull", ...services])

	/**
	 * The last line a container's healthcheck printed, as `exit <code>: <output>`. Undefined when
	 * the container declares no healthcheck, has not run one yet, or docker could not answer. In all
	 * of those the caller has nothing to add beyond the service's state.
	 */
	const lastProbe = async (container: string): Promise<string | undefined> => {
		const res = await run("docker", ["inspect", "--format", "{{json .State.Health}}", container], env)
		if (res.code !== 0) return undefined
		let health: ContainerHealth | null
		try {
			health = JSON.parse(res.stdout.trim())
		} catch {
			return undefined
		}
		const last = health?.Log?.at(-1)
		if (!last) return undefined
		// Collapsed to one line: a probe's output is short, and the error reads as a list of services.
		// Defaulted because a probe docker killed on its own timeout can record no output at all.
		const output = (last.Output ?? "")
			.trim()
			.replace(/\s*\n\s*/g, " ")
			.slice(0, PROBE_OUTPUT_LIMIT)
		return output ? `exit ${last.ExitCode}: ${output}` : `exit ${last.ExitCode}`
	}

	const describe = async (container: ComposeContainer): Promise<string> => {
		const state = container.Health ? `${container.State} (${container.Health})` : container.State
		const probe = await lastProbe(container.Name)
		return `  ${container.Service}: ${state}${probe ? `, healthcheck ${probe}` : ""}`
	}

	/**
	 * Why the stack did not come up, in terms the user can act on: every service that isn't running
	 * and healthy, with the last thing its healthcheck reported. `compose up --wait` only says that
	 * waiting failed, and a probe failing quietly (a 404, a refused connection) leaves no trace in
	 * its stderr, so the container's own health log is the only place that answer exists.
	 *
	 * Never throws. This runs while a failure is already being reported, so a second fault here
	 * (docker gone, a health log shaped differently) must cost the explanation, not replace it.
	 */
	const diagnose = async (): Promise<string> => {
		try {
			const res = await compose(["ps", "--all", "--format", "json"])
			const failing = parseComposePs(res.stdout).filter((container) => container.State !== "running" || !isHealthy(container.Health))
			return (await Promise.all(failing.map(describe))).join("\n")
		} catch {
			return ""
		}
	}

	const composeUp = async (): Promise<void> => {
		const res = await compose(["up", "-d", "--wait", "--wait-timeout", String(WAIT_TIMEOUT_SECONDS)])
		if (res.code === 0) return
		// Both halves, docker's own message first. A failure with no unhealthy service behind it (a
		// denied mount, a port already bound, a bad override) is only ever explained by docker's
		// output, so the service list has to augment it rather than stand in for it.
		const detail = [dockerMessage(res), await diagnose()].filter(Boolean).join("\n")
		throw new Error(`docker compose up failed (waited up to ${WAIT_TIMEOUT_SECONDS}s for healthy services):\n${detail}`)
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
