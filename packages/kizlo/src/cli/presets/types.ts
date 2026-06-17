import type { PackageManager } from "../utils"

export interface PackageJson {
	scripts?: Record<string, string>
	dependencies?: Record<string, string>
	devDependencies?: Record<string, string>
}

export interface InitContext {
	cwd: string
	pkg: PackageJson
	pm: PackageManager
	hasSrcDir: boolean
}

export interface ScaffoldContext {
	/** Last segment of the server directory, e.g. `server`. */
	serverDirName: string
	/** App Router directory, `app` or `src/app`. */
	appDir: string
	/** Import specifier for the server entry from `fromDir` (tsconfig alias or relative). */
	serverImport(fromDir: string): string
}

export interface RouteFile {
	/** Path relative to cwd. */
	path: string
	contents: string
}

export interface Preset {
	id: string
	label: string
	/** Detection confidence: 0 = no match, higher wins. */
	detect(ctx: InitContext): number
	/** Env var holding the public server base URL. */
	baseUrlEnvKey: string
	/** Path the API handler mounts at (e.g. `/api/kizlo`); appended to the base URL. */
	apiPath?: string
	/** Contents of the server entry (`<dir>/server/index.ts`). */
	serverEntry(): string
	/** Contents of the browser client (`<dir>/client.ts`). */
	clientEntry(ctx: ScaffoldContext): string
	/** The API route file to mount the handler — supported frameworks only. */
	routeHandler?(ctx: ScaffoldContext): RouteFile
}
