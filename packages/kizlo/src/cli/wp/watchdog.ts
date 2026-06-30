import { execFile } from "node:child_process"
import { promisify } from "node:util"

const exec = promisify(execFile)

/**
 * Standalone watchdog process spawned (detached, in its own session) by a foreground
 * `kizlo dev`. It polls the parent PID and, the moment the parent is gone — for *any*
 * reason the parent itself couldn't handle: terminal/tab closed, SIGHUP, SIGKILL, a
 * crash — stops that project's containers. This is the guarantee the in-process signal
 * handlers can't give, because a dying process can't be trusted to finish async work.
 *
 * Invoked as: `node watchdog.js <parentPid> <composeProject>`.
 */
const parentPid = Number(process.argv[2])
const project = process.argv[3]

function parentAlive(): boolean {
	try {
		process.kill(parentPid, 0)
		return true
	} catch {
		return false
	}
}

async function stopStack(): Promise<void> {
	try {
		const { stdout } = await exec("docker", ["ps", "-q", "--filter", `label=com.docker.compose.project=${project}`])
		const ids = stdout.split("\n").filter(Boolean)
		if (ids.length) await exec("docker", ["stop", ...ids])
	} catch {
		// Docker gone or already stopped — nothing left to do.
	}
}

if (!parentPid || !project) process.exit(1)

const timer = setInterval(() => {
	if (parentAlive()) return
	clearInterval(timer)
	void stopStack().then(() => process.exit(0))
}, 1000)
