import fs from "node:fs"
import path from "node:path"

export function lockPath(cwd: string): string {
	return path.join(cwd, "node_modules/.cache/kizlo/dev.lock")
}

/** True when a live daemon already owns the lock. Stale locks are ignored. */
export function isLocked(file: string): boolean {
	if (!fs.existsSync(file)) return false
	const pid = Number(fs.readFileSync(file, "utf8").trim())
	if (!pid) return false
	try {
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}

export function acquire(file: string): void {
	fs.mkdirSync(path.dirname(file), { recursive: true })
	fs.writeFileSync(file, String(process.pid))
}

export function release(file: string): void {
	try {
		fs.rmSync(file, { force: true })
	} catch {
		// best effort — a stale lock is detected and reclaimed on next start
	}
}
