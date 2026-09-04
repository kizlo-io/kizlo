import path from "node:path"
import { FSWatcher } from "chokidar"
import { node } from "../../integrations/node/integration"
import { integrationEnv, resolveWordPressConnection } from "../../kizlo"
import { IntrospectionFetchError } from "../../wordpress/fetch-introspection"
import type { WordPressCredentials } from "../../wordpress/types"
import { loadEnvFiles } from "../utils"
import { type ResolvedConfig, resolveConfig } from "./config"
import { type GenerateWordPressOptions, generateIntrospectionOnce, generateOnce, reportGenerationError } from "./generate"
import { acquire, lockPath, release } from "./lock"
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
		const result = await generateOnce(cfg, { credentials })
		if (result.contract === "built") log.success("Contract updated")
		else if (result.contract === "empty" && cfg.server) log.warn(`No Kizlo server found in ${cfg.server.entry}`)
	} catch (error) {
		reportGenerationError("Failed to update the Kizlo contract:", error)
	}
}

/** Watches the server directory and regenerates the contract on change. Only called when a server is present. */
async function watch(
	cfg: ResolvedConfig,
	server: NonNullable<ResolvedConfig["server"]>,
	credentials: WordPressCredentials,
): Promise<FSWatcher> {
	const watcher = new FSWatcher({
		persistent: true,
		ignoreInitial: true,
		ignored: path.resolve(cfg.cwd, server.contractDir),
	})

	const onChange = debounce(() => regenerate(cfg, credentials), 300)

	watcher.add(path.resolve(cfg.cwd, server.dir))
	watcher.on("all", () => void onChange())

	return watcher
}

/**
 * Report the introspection poll's pass. It carries the last failure it reported, because most of what
 * can fail here cannot clear without the user acting (WordPress down, credentials wrong, a document
 * that will not parse, an introspection version this package does not speak), and repeating the same
 * line every few seconds says nothing the first one did not. A failure that reads differently is a
 * different answer and is reported. The state is per reporter rather than per process, so restarting the
 * watcher reports afresh.
 */
function reportGeneration(stack?: StackGuard): (run: () => Promise<"generated" | "unchanged">) => Promise<void> {
	let reported: string | undefined
	return async (run) => {
		try {
			if ((await run()) === "generated") log.success("WordPress introspection updated")
			// Reaching here at all means WordPress answered, whatever it answered with.
			stack?.answered()
			// Only after a report, so the line lands for the user who fixed the cause and never for one
			// who has been running cleanly all along.
			if (reported !== undefined) {
				reported = undefined
				log.success("Updating the WordPress introspection again")
			}
		} catch (error) {
			// Nothing answered, which is the one failure that can mean WordPress is no longer there at
			// all. Every other failure is WordPress telling us something, so it cannot be.
			if (error instanceof IntrospectionFetchError && error.unreachable && (await stack?.ended())) return
			// Keyed on the message: every pass constructs its own error, so the objects never match.
			const message = error instanceof Error ? error.message : String(error)
			if (message === reported) return
			reported = message
			reportGenerationError("Failed to update the WordPress introspection:", error)
		}
	}
}

/**
 * The local stack behind the WordPress this poll talks to, for the sessions that boot one. A project
 * pointing at its own WordPress has no stack to lose and passes nothing, which leaves every failure on
 * the retry path.
 */
export interface StackWatch {
	/** Whether the stack's containers are still up. Asked only once a poll has found nothing answering. */
	status: () => Promise<"running" | "stopped" | "unknown">
	/** End the session. Called once, after {@link status} has confirmed the stack is gone. */
	onStopped: () => void
}

/**
 * How often the guard may ask Docker while the poll keeps failing. The poll retries every 3 seconds,
 * and asking on every failing pass would spawn a subprocess that often for as long as WordPress is
 * unreachable — which, when the stack is up and WordPress is merely broken, is indefinitely. A stack
 * does not stop and restart between two passes, so the slower clock costs at most one interval before
 * the session ends and saves the other four probes.
 */
const STACK_PROBE_INTERVAL_MS = 15_000

/**
 * Turn "nothing answered" into a verdict, by asking Docker rather than inferring it from the fetch.
 * A stack that is still up makes this a hiccup the poll should keep retrying, which is what an
 * `unknown` answer is treated as too: ending a live session over a subprocess that failed to run is
 * a worse outcome than polling a little longer. Answers whether it took the session down, so the
 * caller can skip reporting a failure the user is about to stop caring about.
 *
 * The first failure after a healthy poll is always probed, so a stack that stops under a working
 * session is caught on the next pass rather than a quarter of a minute later.
 */
interface StackGuard {
	/** WordPress answered, so the stack is up and the next failure deserves a fresh probe. */
	answered: () => void
	/** Nothing answered. True when this ended the session, so the caller stops reporting. */
	ended: () => Promise<boolean>
}

function endOnStoppedStack(stack: StackWatch, now: () => number = Date.now): StackGuard {
	let done = false
	let probedAt: number | undefined
	return {
		answered: () => {
			probedAt = undefined
		},
		ended: async () => {
			if (done) return true
			const at = now()
			if (probedAt !== undefined && at - probedAt < STACK_PROBE_INTERVAL_MS) return false
			probedAt = at
			if ((await stack.status()) !== "stopped") return false
			done = true
			log.error("Local WordPress is no longer running. Ending the dev session.")
			stack.onStopped()
			return true
		},
	}
}

/**
 * One pass of the introspection poll: refetch and rewrite `introspection.ts` when WordPress has changed.
 * A server-backed app and a package that ships only procedures both take this same pass, since each has
 * exactly one introspection to keep current; the plugin's PHP changing is picked up either way. The
 * contract is not refreshed here; the file watcher rebuilds it on a server source change.
 */
export function createWordPressRefresh(cfg: ResolvedConfig, options: GenerateWordPressOptions, stack?: StackWatch): () => Promise<void> {
	const guard = stack ? endOnStoppedStack(stack) : undefined
	const introspection = reportGeneration(guard)
	return async () => {
		await introspection(() => generateIntrospectionOnce(cfg, options))
	}
}

/** Run {@link createWordPressRefresh} on a timer, skipping a tick while the previous one is still going. */
function refreshWordPress(cfg: ResolvedConfig, credentials: WordPressCredentials, stack?: StackWatch): NodeJS.Timeout {
	const refresh = createWordPressRefresh(cfg, { credentials }, stack)
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
 * Acquire the single-instance lock, generate once, and start the file watcher. Returns a synchronous
 * `stop()` that closes the watcher and releases the lock, or `undefined` when another watcher already
 * holds the lock (a framework dev script, or a second `kizlo dev`), or when nothing is configured to
 * generate, in which case the caller carries on without watching. Used by `kizlo dev`, both when it
 * boots a local stack and when it runs the watcher alone, so a single terminal covers the whole dev loop.
 */
export async function startWatcher(cwd: string, opts?: { dir?: string; stack?: StackWatch }): Promise<(() => void) | undefined> {
	const lock = lockPath(cwd)
	if (!(await acquire(lock))) {
		log.info("Watcher already running — skipping the contract watcher.")
		return undefined
	}

	// Once the lock is held, `stop()` is the only thing that gives it back, so every other way out of
	// here has to release it first. Setup throws for ordinary reasons — a project with no WordPress
	// credentials in its environment cannot resolve them — and a lock left behind reads as this live
	// PID owning it, which silently costs the session its watcher: `dev`'s reload calls back in, finds
	// the lock held, and skips.
	let handedOver = false
	try {
		const cfg = await resolveConfig(cwd, { dir: opts?.dir })
		if (!cfg) {
			log.info("skipping the contract generation.")
			return undefined
		}

		// Credentials come from the environment and cannot change while the dev server runs, so they are
		// resolved once here rather than on every regeneration.
		loadEnvFiles(cwd)
		const { credentials } = resolveWordPressConnection(undefined, integrationEnv([node()]))

		try {
			const result = await generateOnce(cfg, { credentials })
			if (result.contract === "built") log.success("Contract generated")
			else if (result.contract === "empty" && cfg.server) log.warn(`No Kizlo server found in ${cfg.server.entry}`)
			else if (result.introspection === "generated") log.success("WordPress introspection generated")
		} catch (error) {
			reportGenerationError("Failed to generate the Kizlo contract:", error)
		}

		// Only a server has sources worth watching; a package with just the introspection rides the poll below.
		const watcher = cfg.server ? await watch(cfg, cfg.server, credentials) : undefined
		const wordpressRefresh = refreshWordPress(cfg, credentials, opts?.stack)
		let stopped = false
		handedOver = true
		return () => {
			if (stopped) return
			stopped = true
			release(lock)
			clearInterval(wordpressRefresh)
			void watcher?.close()
		}
	} finally {
		if (!handedOver) release(lock)
	}
}
