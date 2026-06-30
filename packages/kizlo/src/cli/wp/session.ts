import { execFile, spawn } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const exec = promisify(execFile)

/**
 * Where foreground `kizlo dev` sessions are recorded, keyed by compose project.
 * Global (not per-repo) on purpose: the whole point is to reap a *different*
 * project's stack that was orphaned by a crashed session you never came back to.
 */
function registryPath(): string {
	return join(homedir(), ".cache", "kizlo", "dev-sessions.json")
}

/** A live foreground session: the compose project and the PID that owns it. */
interface Session {
	pid: number
}

type Registry = Record<string, Session>

function readRegistry(): Registry {
	const file = registryPath()
	if (!existsSync(file)) return {}
	try {
		return JSON.parse(readFileSync(file, "utf8")) as Registry
	} catch {
		// A corrupt registry shouldn't wedge `dev`; start clean.
		return {}
	}
}

function writeRegistry(registry: Registry): void {
	const file = registryPath()
	mkdirSync(dirname(file), { recursive: true })
	writeFileSync(file, JSON.stringify(registry, null, 2))
}

/** True when a process with this PID is still alive (signal 0 probes without killing). */
function pidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}

/**
 * Stop a compose project's containers by label, without needing its compose files.
 * Used for orphans owned by a dead PID — we can't assume we're in that project's
 * directory, so we target the running containers directly rather than via compose.
 */
async function stopByProject(project: string): Promise<void> {
	const { stdout } = await exec("docker", ["ps", "-q", "--filter", `label=com.docker.compose.project=${project}`])
	const ids = stdout.split("\n").filter(Boolean)
	if (ids.length) await exec("docker", ["stop", ...ids])
}

/**
 * Stop and remove *every* container for `project` — running or stopped — keeping its
 * volumes (the DB and bind-mounted install survive). Run right before bringing a dev
 * stack up so `compose up` creates brand-new containers instead of reconciling a stale
 * one left by a crashed session or a second invocation: reconciling an existing — often
 * unhealthy — mysql in place is what intermittently fails the dependency wait with
 * "exited (137)". Returns true if it removed anything. Best effort: a docker-down error
 * surfaces later on `up`, where the message is actionable.
 */
export async function removeProjectContainers(project: string): Promise<boolean> {
	try {
		const { stdout } = await exec("docker", ["ps", "-aq", "--filter", `label=com.docker.compose.project=${project}`])
		const ids = stdout.split("\n").filter(Boolean)
		if (!ids.length) return false
		// Stop gracefully first (a no-op on already-stopped containers), then force-remove
		// so a container that ignored SIGTERM still goes; named volumes are untouched.
		await exec("docker", ["stop", ...ids]).catch(() => {})
		await exec("docker", ["rm", "-f", ...ids])
		return true
	} catch {
		return false
	}
}

/**
 * Spawn the detached watchdog that stops `project`'s stack when this process dies by
 * any means the in-process handlers can't catch (terminal closed, SIGKILL, crash).
 * Returns its PID so the graceful teardown path can kill it (the stack is already
 * being stopped, so the watchdog would have nothing to do). Best effort: a failure
 * here just means we fall back to signal handlers + the startup reaper.
 */
export function spawnWatchdog(project: string): number | undefined {
	try {
		const watchdog = fileURLToPath(new URL("./watchdog.js", import.meta.url))
		const child = spawn(process.execPath, [watchdog, String(process.pid), project], {
			detached: true,
			stdio: "ignore",
		})
		child.unref()
		return child.pid
	} catch {
		return undefined
	}
}

/** Record this process as the owner of `project`'s foreground stack. */
export function registerSession(project: string): void {
	const registry = readRegistry()
	registry[project] = { pid: process.pid }
	writeRegistry(registry)
}

/** Drop `project` from the registry (graceful teardown). Best effort. */
export function unregisterSession(project: string): void {
	try {
		const registry = readRegistry()
		if (registry[project]) {
			delete registry[project]
			writeRegistry(registry)
		}
	} catch {
		// best effort — a stale entry is reaped on the next `kizlo dev`
	}
}

/**
 * Stop any foreground stacks whose owning session has died (SIGKILL, crash, power
 * loss) — the cases a signal handler can never catch. Runs at the start of every
 * `kizlo dev`, so leaked stacks from *any* project self-heal the next time you
 * bring one up. Returns the projects that were reaped, for logging.
 */
export async function reapOrphans(): Promise<string[]> {
	const registry = readRegistry()
	const reaped: string[] = []
	let changed = false

	for (const [project, session] of Object.entries(registry)) {
		if (pidAlive(session.pid)) continue
		try {
			await stopByProject(project)
			reaped.push(project)
		} catch {
			// Docker down or already gone — drop the entry anyway so it stops being retried.
		}
		delete registry[project]
		changed = true
	}

	if (changed) writeRegistry(registry)
	return reaped
}
