import path from "node:path"
import { FSWatcher } from "chokidar"
import type { ResolvedConfig } from "./config"
import { generateOnce } from "./generate"
import { log } from "./logger"

function debounce<T extends (...args: never[]) => Promise<void>>(fn: T, delay: number): T {
	let timer: NodeJS.Timeout
	return ((...args) => {
		clearTimeout(timer)
		timer = setTimeout(() => void fn(...args), delay)
	}) as T
}

async function regenerate(cfg: ResolvedConfig): Promise<void> {
	const ok = await generateOnce(cfg)
	if (ok) log.success("Contract updated")
	else log.warn(`No Kizlo server found in ${cfg.serverEntry}`)
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
	watcher.on("ready", () => log.start("Watching for changes..."))
	watcher.on("all", () => void onChange())

	return watcher
}
