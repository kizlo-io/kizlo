import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { FSWatcher } from "chokidar"
import { CONFIG_FILES } from "./config"

/** Env files `loadEnvFiles` reads, in the same order — the runtime values a reload must pick up. */
const ENV_FILES = [".env", ".env.local"]

/** A combined hash of the watched files' contents; a missing file counts as empty. */
function fingerprint(files: string[]): string {
	const hash = createHash("sha1")
	for (const file of files) {
		hash.update(file)
		hash.update("\0")
		try {
			hash.update(readFileSync(file))
		} catch {
			// Missing file — folded in as empty, so creating or deleting it still shifts the hash.
		}
		hash.update("\0")
	}
	return hash.digest("hex")
}

/**
 * Watch the project's `.env` files and `kizlo.config.*` and call `onReload` with the changed file's
 * basename when their *contents* change. `kizlo dev` uses this to restart its whole session — rebooting
 * local WordPress and regenerating the contract — so a changed port, connection, or fixture takes
 * effect without stopping and rerunning the command by hand. Debounced so an editor's multi-write save
 * fires once, and gated on a content hash so a no-op save (`touch`, or writing the file back unchanged)
 * is ignored rather than triggering a pointless reboot. Returns a synchronous `stop()` that closes the
 * watcher.
 *
 * `dev` rewrites `.env` itself while booting (fresh credentials, the current LAN URL); the caller
 * pauses its reload handler around a reboot so that self-write doesn't trigger another reload. The hash
 * is still refreshed for it here, so once the reboot settles the new content is the baseline and won't
 * re-fire.
 */
export function watchReload(configDir: string, onReload: (changed: string) => void): () => void {
	const files = [...ENV_FILES, ...CONFIG_FILES].map((name) => path.join(configDir, name))
	const watcher = new FSWatcher({ persistent: true, ignoreInitial: true })

	let last = fingerprint(files)
	let timer: NodeJS.Timeout
	const schedule = (changed: string): void => {
		clearTimeout(timer)
		timer = setTimeout(() => {
			const next = fingerprint(files)
			if (next === last) return // saved with no content change — nothing to reload
			last = next
			onReload(path.basename(changed))
		}, 300)
	}

	watcher.add(files)
	watcher.on("all", (_event, changed) => schedule(changed))

	let stopped = false
	return () => {
		if (stopped) return
		stopped = true
		clearTimeout(timer)
		void watcher.close()
	}
}
