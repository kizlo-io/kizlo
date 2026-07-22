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
	/** Kizlo home directory relative to cwd (`src/lib/kizlo`); the `{{kizloDir}}` token in template paths. */
	kizloDir: string
	/** Last segment of the server directory, e.g. `server`. */
	serverDirName: string
	/** Server entry path relative to cwd (`<dir>/server/index.ts`); where the server file is written. */
	serverEntryPath: string
	/** Browser client path relative to cwd (`<dir>/client.ts`); where the client file is written. */
	clientPath: string
	/** App Router directory, `app` or `src/app`. */
	appDir: string
	/** Import specifier for the server entry from `fromDir` (tsconfig alias or relative). */
	serverImport(fromDir: string): string
	/**
	 * Backend URL to inline into the browser client, set only when it differs from the site origin
	 * (base preset, split deployment). Undefined when the client can default to the page origin or
	 * resolves the URL from a framework env var.
	 */
	clientUrl?: string
}

export interface ScaffoldFile {
	/** Human label used in prompts and logs, e.g. `API route`. */
	label: string
	/** Path relative to cwd. */
	relPath: string
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
	/**
	 * The template folder this preset scaffolds from (e.g. `nextjs`). When set, init fetches the
	 * template at runtime and drives its wiring from the template's manifest — the file bodies live
	 * only in the template, never baked into the CLI. Presets without a template (`base`) scaffold
	 * their files inline via {@link scaffolds}.
	 */
	template?: string
	/**
	 * Files this preset scaffolds inline, each a labeled {@link ScaffoldFile} with its own path. Used
	 * only by presets with no {@link template}; the server entry and browser client are written under
	 * the user-chosen dir from the context. init runs every file through the shared overwrite policy.
	 */
	scaffolds?(ctx: ScaffoldContext): ScaffoldFile[]
}
