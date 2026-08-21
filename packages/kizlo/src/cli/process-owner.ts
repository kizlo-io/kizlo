import { randomUUID } from "node:crypto"
import { createConnection, createServer, type Server } from "node:net"

const HOST = "127.0.0.1"
const PROBE_TIMEOUT_MS = 250

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
		const server = createServer((socket) => socket.end(token))
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

function pidAlive(pid: number): boolean {
	if (!Number.isSafeInteger(pid) || pid <= 0) return false
	try {
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}

function hasDiscriminator(owner: StoredProcessOwner): owner is ProcessOwner {
	return "port" in owner || "token" in owner
}

/** True only when the recorded PID and its random liveness token still match. */
export async function ownerAlive(owner: StoredProcessOwner): Promise<boolean> {
	if (typeof owner !== "object" || owner === null || !("pid" in owner)) return false
	if (!pidAlive(owner.pid)) return false
	if (!hasDiscriminator(owner)) return true
	if (!Number.isSafeInteger(owner.port) || owner.port <= 0 || owner.port > 65_535 || typeof owner.token !== "string" || !owner.token) {
		return false
	}

	return new Promise((resolve) => {
		let response = ""
		let settled = false
		const socket = createConnection({ host: HOST, port: owner.port })
		socket.setEncoding("utf8")
		socket.setTimeout(PROBE_TIMEOUT_MS)

		const finish = (alive: boolean): void => {
			if (settled) return
			settled = true
			socket.destroy()
			resolve(alive)
		}

		socket.on("data", (chunk: string) => {
			response += chunk
			if (response.length > owner.token.length) finish(false)
		})
		socket.on("end", () => finish(response === owner.token))
		socket.on("error", () => finish(false))
		socket.on("timeout", () => finish(false))
	})
}
