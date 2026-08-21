import fs from "node:fs"
import path from "node:path"
import { currentProcessOwner, ownerAlive, type ProcessOwner, type StoredProcessOwner } from "../process-owner"

export function lockPath(cwd: string): string {
	return path.join(cwd, "node_modules/.cache/kizlo/dev.lock")
}

/** True when a live daemon still owns the process identity recorded by the lock. */
export async function isLocked(file: string): Promise<boolean> {
	if (!fs.existsSync(file)) return false
	const contents = fs.readFileSync(file, "utf8").trim()
	let owner: StoredProcessOwner
	try {
		owner = contents.startsWith("{") ? (JSON.parse(contents) as StoredProcessOwner) : { pid: Number(contents) }
	} catch {
		return false
	}
	return ownerAlive(owner)
}

/** Claim the file for this process, or report that it was already there. */
function claim(file: string, owner: ProcessOwner): boolean {
	try {
		fs.writeFileSync(file, JSON.stringify(owner), { flag: "wx" })
		return true
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
		return false
	}
}

/**
 * Take the lock for this process, answering false when a live daemon already holds it. The file is
 * created with `wx`, so two `kizlo dev` starting together cannot both come away believing they won.
 * A lock whose owner has died or whose PID belongs to another process is removed and taken over.
 * Losing the second claim means another process reached the same stale lock first, so this one
 * stands down rather than trying again.
 */
export async function acquire(file: string): Promise<boolean> {
	fs.mkdirSync(path.dirname(file), { recursive: true })
	const owner = await currentProcessOwner()
	if (claim(file, owner)) return true
	if (await isLocked(file)) return false
	fs.rmSync(file, { force: true })
	return claim(file, owner)
}

export function release(file: string): void {
	try {
		fs.rmSync(file, { force: true })
	} catch {}
}
