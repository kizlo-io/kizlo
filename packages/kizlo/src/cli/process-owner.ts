import { randomUUID } from "node:crypto"
import { createConnection, createServer, type Server } from "node:net"

const HOST = "127.0.0.1"

/** A busy dev session can miss this deadline; timeout means unknown, never confirmed exit. */
const PROBE_TIMEOUT_MS = 1_000

/** A process identity that stays unique when the operating system recycles its PID. */
export interface ProcessOwner {
	pid: number
	port: number
	token: string
}

/** PID-only records written by older Kizlo versions remain readable during migration. */
export type StoredProcessOwner = ProcessOwner | { pid: number }

let ownerPromise: Promise<ProcessOwner> | undefined
const ownerServers = new Set<Server>()

/**
 * Return this process's stable identity. The unreferenced loopback server answers with
 * a random token, so a process that later reuses both the PID and port still cannot
 * impersonate the owner recorded by a dev session or lock.
 */
export function currentProcessOwner(): Promise<ProcessOwner> {
	if (ownerPromise) return ownerPromise

	ownerPromise = new Promise((resolve, reject) => {
		const token = randomUUID()
		const server = createServer((socket) => {
			// A probe may time out while type checking blocks this process's event loop.
			socket.on("error", () => {})
			socket.end(token)
		})
		server.unref()

		const failed = (error: Error): void => {
			ownerPromise = undefined
			try {
				server.close()
			} catch {}
			reject(error)
		}
		server.once("error", failed)
		server.listen(0, HOST, () => {
			server.off("error", failed)
			server.on("error", () => {})
			const address = server.address()
			if (!address || typeof address === "string") {
				failed(new Error("Could not bind the process liveness probe"))
				return
			}
			ownerServers.add(server)
			resolve({ pid: process.pid, port: address.port, token })
		})
	})

	return ownerPromise
}

export type OwnerStatus = "alive" | "dead" | "unknown"

function pidStatus(pid: number): OwnerStatus {
	if (!Number.isSafeInteger(pid) || pid <= 0) return "dead"
	try {
		process.kill(pid, 0)
		return "alive"
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "ESRCH" ? "dead" : "unknown"
	}
}

function hasDiscriminator(owner: StoredProcessOwner): owner is ProcessOwner {
	return "port" in owner || "token" in owner
}

/** A missed probe cannot distinguish a busy owner from a stale record. */
export async function ownerStatus(owner: StoredProcessOwner): Promise<OwnerStatus> {
	if (typeof owner !== "object" || owner === null || !("pid" in owner)) return "dead"
	const pid = pidStatus(owner.pid)
	if (pid !== "alive" || !hasDiscriminator(owner)) return pid
	if (!Number.isSafeInteger(owner.port) || owner.port <= 0 || owner.port > 65_535 || typeof owner.token !== "string" || !owner.token) {
		return "dead"
	}

	return new Promise((resolve) => {
		let response = ""
		let settled = false
		const socket = createConnection({ host: HOST, port: owner.port })
		socket.setEncoding("utf8")
		socket.setTimeout(PROBE_TIMEOUT_MS)

		const finish = (status: OwnerStatus): void => {
			if (settled) return
			settled = true
			socket.destroy()
			resolve(status)
		}

		socket.on("data", (chunk: string) => {
			response += chunk
			if (response.length > owner.token.length) finish("dead")
		})
		const missed = (): void => finish(pidStatus(owner.pid) === "dead" ? "dead" : "unknown")
		socket.on("end", () => {
			if (response) finish(response === owner.token ? "alive" : "dead")
			else missed()
		})
		socket.on("error", missed)
		socket.on("timeout", missed)
	})
}

/** True only when the recorded PID and its random liveness token still match. */
export async function ownerAlive(owner: StoredProcessOwner): Promise<boolean> {
	return (await ownerStatus(owner)) === "alive"
}
