import path from "node:path"
import { FSWatcher } from "chokidar"
import { type ResolvedConfig, resolveConfig } from "./config"
import { generateOnce } from "./generate"
import { acquire, isLocked, lockPath, release } from "./lock"
import { log } from "./logger"

function debounce<T extends (...args: never[]) => Promise<void>>(fn: T, delay: number): T {
	let timer: NodeJS.Timeout
	return ((...args) => {
		clearTimeout(timer)
		timer = setTimeout(() => void fn(...args), delay)
	}) as T
}

async function regenerate(cfg: ResolvedConfig): Promise<void> {
	try {
		const ok = await generateOnce(cfg)
		if (ok) log.success("Contract updated")
		else log.warn(`No Kizlo server found in ${cfg.serverEntry}`)
	} catch (error) {
		// A transient error in the user's server (e.g. mid-edit syntax error) must
		// not crash the watcher — keep the previous contract and wait for the fix.
		log.error("Failed to update the Kizlo contract:", error)
	}
}

/** Watches the server directory and regenerates the contract on change. */
export async function watch(cfg: ResolvedConfig): Promise<FSWatcher> {
	const watcher = new FSWatcher({
		persistent: true,
		ignoreInitial: true,
		ignored: path.resolve(cfg.cwd, cfg.generatedDir),
	})

	const onChange = debounce(() => regenerate(cfg), 300)

	watcher.add(path.resolve(cfg.cwd, cfg.serverDir))
	watcher.on("ready", () => log.start("Watching for contract changes..."))
	watcher.on("all", () => void onChange())

	return watcher
}

/**
 * Acquire the single-instance lock, generate the contract once, and start the file
 * watcher. Returns a synchronous `stop()` that closes the watcher and releases the
 * lock — or `undefined` when another watcher already holds the lock (a standalone
 * `kizlo watch`, or a framework dev script), in which case the caller carries on
 * without watching. Shared by the standalone `kizlo watch` command and the
 * folded-in watcher of `kizlo dev`, so a single terminal covers both.
 */
export async function startWatcher(cwd: string, opts?: { dir?: string }): Promise<(() => void) | undefined> {
	const lock = lockPath(cwd)
	// Single-instance: a framework dev script and a manual `kizlo watch` (or a
	// `kizlo dev` that folds it in) must not both watch and write the same contract.
	if (isLocked(lock)) {
		log.info("Watcher already running — skipping the contract watcher.")
		return undefined
	}

	const cfg = await resolveConfig(cwd, { dir: opts?.dir })
	acquire(lock)

	// A broken server entry at startup shouldn't abort the watcher — report it and
	// keep watching so the next save can fix it.
	try {
		const ok = await generateOnce(cfg)
		if (ok) log.success("Contract generated")
		else log.warn(`No Kizlo server found in ${cfg.serverEntry}`)
	} catch (error) {
		log.error("Failed to generate the Kizlo contract:", error)
	}

	const watcher = await watch(cfg)
	let stopped = false
	return () => {
		if (stopped) return
		stopped = true
		// release() is synchronous, so it clears the lock even from a process-exit
		// handler; the watcher's own fds are freed when the process dies.
		release(lock)
		void watcher.close()
	}
}
