import fs from "node:fs"
import path from "node:path"

export function lockPath(cwd: string): string {
	return path.join(cwd, "node_modules/.cache/kizlo/dev.lock")
}

/** True when a live daemon already owns the lock. Stale locks are ignored. */
function isLocked(file: string): boolean {
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

/** Claim the file for this process, or report that it was already there. */
function claim(file: string): boolean {
	try {
		fs.writeFileSync(file, String(process.pid), { flag: "wx" })
		return true
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
		return false
	}
}

/**
 * Take the lock for this process, answering false when a live daemon already holds it. The file is
 * created with `wx`, so two `kizlo dev` starting together cannot both come away believing they won —
 * the loser's create fails on the file the winner made. Testing liveness and then writing left a
 * window where both passed the test.
 *
 * A lock whose owner has died is removed and taken over, which is the only reason the second claim
 * exists. Losing that one means another process reached the same stale lock first, so this one
 * stands down rather than trying again.
 */
export function acquire(file: string): boolean {
	fs.mkdirSync(path.dirname(file), { recursive: true })
	if (claim(file)) return true
	if (isLocked(file)) return false
	fs.rmSync(file, { force: true })
	return claim(file)
}

export function release(file: string): void {
	try {
		fs.rmSync(file, { force: true })
	} catch {}
}
