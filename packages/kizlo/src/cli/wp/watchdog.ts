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

let checking = false
const timer = setInterval(() => {
	if (checking) return
	checking = true
	void ownerAlive(parent).then((alive) => {
		if (alive) {
			checking = false
			return
		}
		clearInterval(timer)
		void stopStack().then(() => process.exit(0))
	})
}, 1000)
