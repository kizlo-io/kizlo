import path from "node:path"
import { FSWatcher } from "chokidar"
import { resolveWordPressConnection } from "../../kizlo"
import type { WordPressCredentials } from "../../wordpress/types"
import { loadEnvFiles } from "../utils"
import { type ResolvedConfig, resolveConfig, resolveWordPressClientDir } from "./config"
import {
	type GenerateWordPressOptions,
	generateOnce,
	generateWordPressOnce,
	generateWorkspaceClientOnce,
	reportGenerationError,
} from "./generate"
import { acquire, isLocked, lockPath, release } from "./lock"
import { log } from "./logger"

function debounce<T extends (...args: never[]) => Promise<void>>(fn: T, delay: number): T {
	let timer: NodeJS.Timeout
	return ((...args) => {
		clearTimeout(timer)
		timer = setTimeout(() => void fn(...args), delay)
	}) as T
}

async function regenerate(cfg: ResolvedConfig, credentials: WordPressCredentials): Promise<void> {
	try {
		const ok = await generateOnce(cfg, { credentials })
		if (ok) log.success("Contract updated")
		else log.warn(`No Kizlo server found in ${cfg.serverEntry}`)
	} catch (error) {
		reportGenerationError("Failed to update the Kizlo contract:", error)
	}
}

/** Watches the server directory and regenerates the contract on change. */
async function watch(cfg: ResolvedConfig, credentials: WordPressCredentials): Promise<FSWatcher> {
	const watcher = new FSWatcher({
		persistent: true,
		ignoreInitial: true,
		ignored: path.resolve(cfg.cwd, cfg.generatedDir),
	})

	const onChange = debounce(() => regenerate(cfg, credentials), 300)

	watcher.add(path.resolve(cfg.cwd, cfg.serverDir))
	watcher.on("all", () => void onChange())

	return watcher
}

/**
 * One pass of the WordPress poll. `cfg` covers an app's client next to its contract; `wordpressClientDir`
 * covers a workspace that has only the client. A project has one or the other, but both are refreshed
 * together so the plugin's PHP changing is picked up either way.
 *
 * The returned function carries the last failure it reported, because most of what can fail here cannot
 * clear without the user acting — WordPress down, credentials wrong, a document that will not parse, an
 * introspection version this package does not speak — and repeating the same line every few seconds says
 * nothing the first one did not. A failure that reads differently is a different answer and is reported.
 * The state is per refresh rather than per process, so restarting the watcher reports afresh.
 */
export function createWordPressRefresh(
	cwd: string,
	cfg: ResolvedConfig | undefined,
	wordpressClientDir: string | undefined,
	options: GenerateWordPressOptions,
): () => Promise<void> {
	let reported: string | undefined
	return async () => {
		try {
			if (cfg && (await generateWordPressOnce(cfg, options)) === "generated") log.success("WordPress service updated")
			if (wordpressClientDir && (await generateWorkspaceClientOnce(cwd, wordpressClientDir, options)) === "generated") {
				log.success("WordPress client updated")
			}
			// Only after a report, so the line lands for the user who fixed the cause and never for one
			// who has been running cleanly all along.
			if (reported !== undefined) {
				reported = undefined
				log.success("Updating the WordPress service again")
			}
		} catch (error) {
			// Keyed on the message: every pass constructs its own error, so the objects never match.
			const message = error instanceof Error ? error.message : String(error)
			if (message === reported) return
			reported = message
			reportGenerationError("Failed to update the WordPress service:", error)
		}
	}
}

/** Run {@link createWordPressRefresh} on a timer, skipping a tick while the previous one is still going. */
function refreshWordPress(
	cwd: string,
	cfg: ResolvedConfig | undefined,
	wordpressClientDir: string | undefined,
	credentials: WordPressCredentials,
): NodeJS.Timeout {
	const refresh = createWordPressRefresh(cwd, cfg, wordpressClientDir, { credentials })
	let refreshing = false
	const timer = setInterval(() => {
		if (refreshing) return
		refreshing = true
		void refresh().finally(() => {
			refreshing = false
		})
	}, 3_000)
	timer.unref()
	return timer
}

/**
 * Acquire the single-instance lock, generate the contract once, and start the file
 * watcher. Returns a synchronous `stop()` that closes the watcher and releases the
 * lock — or `undefined` when another watcher already holds the lock (a framework dev
 * script, or a second `kizlo dev`), or when no server `dir` is configured, in which case
 * the caller carries on without watching. Used by `kizlo dev`, both when it boots a local
 * stack and when it runs the watcher alone, so a single terminal covers the whole dev loop.
 */
export async function startWatcher(cwd: string, opts?: { dir?: string }): Promise<(() => void) | undefined> {
	const lock = lockPath(cwd)
	if (isLocked(lock)) {
		log.info("Watcher already running — skipping the contract watcher.")
		return undefined
	}

	const cfg = await resolveConfig(cwd, { dir: opts?.dir })
	const wordpressClientDir = await resolveWordPressClientDir(cwd)
	if (!cfg && !wordpressClientDir) {
		log.info("skipping the contract generation.")
		return undefined
	}
	acquire(lock)

	// Credentials come from the environment and cannot change while the dev server runs, so they are
	// resolved once here rather than on every regeneration.
	loadEnvFiles(cwd)
	const { credentials } = resolveWordPressConnection(undefined)

	if (wordpressClientDir) {
		try {
			if ((await generateWorkspaceClientOnce(cwd, wordpressClientDir, { credentials })) === "generated") {
				log.success("WordPress client generated")
			}
		} catch (error) {
			reportGenerationError("Failed to generate the WordPress client:", error)
		}
	}

	if (cfg) {
		try {
			const ok = await generateOnce(cfg, { credentials })
			if (ok) log.success("Contract generated")
			else log.warn(`No Kizlo server found in ${cfg.serverEntry}`)
		} catch (error) {
			reportGenerationError("Failed to generate the Kizlo contract:", error)
		}
	}

	// Only a server has sources worth watching; a workspace with just the client rides the poll below.
	const watcher = cfg ? await watch(cfg, credentials) : undefined
	const wordpressRefresh = refreshWordPress(cwd, cfg, wordpressClientDir, credentials)
	let stopped = false
	return () => {
		if (stopped) return
		stopped = true
		release(lock)
		clearInterval(wordpressRefresh)
		void watcher?.close()
	}
}
