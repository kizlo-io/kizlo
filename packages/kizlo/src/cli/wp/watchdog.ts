import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { ownerAlive, type ProcessOwner } from "../process-owner"

const exec = promisify(execFile)

/**
 * Standalone watchdog process spawned (detached, in its own session) by a foreground
 * `kizlo dev`. It polls the parent's identity and, the moment the parent is gone for *any*
 * reason the parent itself couldn't handle: terminal/tab closed, SIGHUP, SIGKILL, a
 * crash — stops that project's containers. This is the guarantee the in-process signal
 * handlers can't give, because a dying process can't be trusted to finish async work.
 *
 * Invoked as: `node watchdog.js <parentPid> <livenessPort> <livenessToken> <composeProject>`.
 */
const parentPid = Number(process.argv[2])
const parentPort = Number(process.argv[3])
const parentToken = process.argv[4]
const project = process.argv[5]

async function stopStack(): Promise<void> {
	try {
		const { stdout } = await exec("docker", ["ps", "-q", "--filter", `label=com.docker.compose.project=${project}`])
		const ids = stdout.split("\n").filter(Boolean)
		if (ids.length) await exec("docker", ["stop", ...ids])
	} catch {}
}

if (!parentPid || !parentPort || !parentToken || !project) process.exit(1)
const parent: ProcessOwner = { pid: parentPid, port: parentPort, token: parentToken }

/**
 * Missed probes before the parent counts as gone. The probe is answered on the parent's own event
 * loop, which its typecheck of the generated client blocks for the better part of a second, so a
 * single miss says the parent was busy at least as often as it says the parent died. Stopping the
 * stack is not recoverable from here, and the cost of being slow about it is a few seconds of
 * containers outliving a dead session, which the next `kizlo dev` reaps anyway.
 */
const MISSES_BEFORE_STOP = 3

let checking = false
let missed = 0
const timer = setInterval(() => {
	if (checking) return
	checking = true
	void ownerAlive(parent).then((alive) => {
		if (alive) {
			missed = 0
			checking = false
			return
		}
		if (++missed < MISSES_BEFORE_STOP) {
			checking = false
			return
		}
		clearInterval(timer)
		void stopStack().then(() => process.exit(0))
	})
}, 1000)
