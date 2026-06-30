import { createServer } from "node:net"

/** Thrown when an explicitly-configured port is already taken — a collision the user owns. */
export class PortInUseError extends Error {
	readonly port: number
	readonly host: string

	constructor(port: number, host: string) {
		super(`Port ${host}:${port} is already in use`)
		this.name = "PortInUseError"
		this.port = port
		this.host = host
	}
}

/** True if `host:port` can be bound right now (i.e. nothing else is listening on it). */
export function isFree(port: number, host = "0.0.0.0"): Promise<boolean> {
	return new Promise((resolvePromise) => {
		const server = createServer()
		server.once("error", () => resolvePromise(false))
		server.listen({ port, host }, () => server.close(() => resolvePromise(true)))
	})
}

/** An OS-assigned ephemeral port on `host` — the fallback when the whole scan range is taken. */
function ephemeralPort(host: string): Promise<number> {
	return new Promise((resolvePromise, reject) => {
		const server = createServer()
		server.once("error", reject)
		server.listen({ port: 0, host }, () => {
			const address = server.address()
			const port = typeof address === "object" && address ? address.port : 0
			server.close(() => resolvePromise(port))
		})
	})
}

/**
 * Resolve `preferred` to a host port that's actually free, scanning upward from it.
 * The configured/default value is only a *starting point*: if it (or the next few) are
 * already taken — by a stray container, another stack, or any unrelated server — we step
 * to the next free port instead of letting `docker compose up` fail with a port clash.
 * Falls back to an OS-assigned ephemeral port if the whole scan range is busy.
 *
 * `host` must match how the port is published: `0.0.0.0` for the all-interfaces WP port,
 * `127.0.0.1` for the loopback-only MySQL port — a port can be free on one and not the other.
 */
export async function findFreePort(preferred: number, host = "0.0.0.0"): Promise<number> {
	for (let port = preferred; port < preferred + 100; port++) {
		if (await isFree(port, host)) return port
	}
	return ephemeralPort(host)
}

/**
 * Resolve a host port, branching on whether the value was *chosen by the user*:
 *
 * - A **default** port (`fixed: false`) is only a starting point — if it's taken (by another
 *   project's stack or any unrelated server) we step to the next free one via {@link findFreePort},
 *   so the stack comes up instead of failing on a clash.
 * - An **explicit** port (`fixed: true`, set in `kizlo.config`) is the user taking control: a
 *   collision there is theirs to resolve, so we throw {@link PortInUseError} rather than silently
 *   serving somewhere they didn't ask for.
 */
export async function resolveHostPort(preferred: number, { fixed, host = "0.0.0.0" }: { fixed: boolean; host?: string }): Promise<number> {
	if (!fixed) return findFreePort(preferred, host)
	if (await isFree(preferred, host)) return preferred
	throw new PortInUseError(preferred, host)
}
