import { randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { currentProcessOwner, ownerStatus, type ProcessOwner, type StoredProcessOwner } from "../process-owner"

export function lockPath(cwd: string): string {
	return path.join(cwd, "node_modules/.cache/kizlo/dev.lock")
}

function readLock(file: string): string | undefined {
	try {
		return fs.readFileSync(file, "utf8")
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
		throw error
	}
}

async function held(contents: string): Promise<boolean> {
	let owner: StoredProcessOwner
	try {
		owner = contents.trim().startsWith("{") ? (JSON.parse(contents) as StoredProcessOwner) : { pid: Number(contents) }
	} catch {
		return false
	}
	return (await ownerStatus(owner)) !== "dead"
}

/** An uncertain identity must not let another command take over live resources. */
export async function isLocked(file: string): Promise<boolean> {
	const contents = readLock(file)
	return contents !== undefined && (await held(contents))
}

/** Claim the file for this process, or report that it was already there. */
function claim(file: string, owner: ProcessOwner): boolean {
	const pending = `${file}.${randomUUID()}.tmp`
	try {
		fs.writeFileSync(pending, JSON.stringify(owner), { flag: "wx", mode: 0o600 })
		// Publish a complete record atomically; contenders must never read a half-written owner.
		fs.linkSync(pending, file)
		return true
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
		return false
	} finally {
		fs.rmSync(pending, { force: true })
	}
}

/** Publish one complete owner record, serializing and rechecking any stale-owner replacement. */
export async function acquire(file: string): Promise<boolean> {
	fs.mkdirSync(path.dirname(file), { recursive: true })
	const owner = await currentProcessOwner()
	if (claim(file, owner)) return true
	const contents = readLock(file)
	if (contents === undefined) return claim(file, owner)
	if (await held(contents)) return false
	// shortcut: a killed reclaimer needs manual guard removal with dev stopped; use OS locks if automatic recovery is required.
	const recovery = `${file}.reclaim`
	try {
		fs.mkdirSync(recovery)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
		throw new Error(
			`Lock recovery is concurrent or was interrupted. Retry; if this persists, stop this project's dev commands and remove ${recovery}.`,
		)
	}
	try {
		// Recheck under the recovery guard: another claimant may already have replaced this owner.
		if (readLock(file) !== contents) return false
		fs.rmSync(file, { force: true })
		return claim(file, owner)
	} finally {
		fs.rmdirSync(recovery)
	}
}

export function release(file: string): void {
	try {
		fs.rmSync(file, { force: true })
	} catch {}
}

/** Lifecycle operations share one lock, separate from the long-lived contract watcher. */
export function operationLock(configDir: string): string {
	return path.join(configDir, ".kizlo/dev-operation.lock")
}

export async function releaseOwned(file: string): Promise<void> {
	const owner = await currentProcessOwner()
	try {
		const recorded = JSON.parse(fs.readFileSync(file, "utf8")) as ProcessOwner
		if (recorded.pid === owner.pid && recorded.token === owner.token) release(file)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
	}
}

export async function withOperation<T>(configDir: string, run: () => Promise<T>): Promise<T> {
	const file = operationLock(configDir)
	if (!(await acquire(file)))
		throw new Error("Another dev start, reload, stop, reset or export is active. Wait for it to finish and retry.")
	try {
		return await run()
	} finally {
		await releaseOwned(file)
	}
}
