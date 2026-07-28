export interface PackageJson {
	scripts?: Record<string, string>
	dependencies?: Record<string, string>
	devDependencies?: Record<string, string>
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

/**
 * The generic no-template fallback `init` uses when a project matches no template in the registry — the
 * *absence* of a framework, not framework logic, so it doesn't recreate the template/CLI split. It writes
 * its own server entry and browser client inline (framework templates carry those as real files instead),
 * and its `.env` names come from {@link DEFAULT_ENV_KEYS}, so it declares no `apiPath`, no `env`, and no
 * detection signal. There is exactly one, `base`.
 */
export interface Fallback {
	/** Human label used in logs, e.g. `Generic (no framework detected)`. */
	label: string
	/**
	 * Files the fallback scaffolds inline, each a labeled {@link ScaffoldFile} with its own path — the
	 * server entry and browser client, written under the user-chosen dir from the context. init runs
	 * every file through the shared overwrite policy.
	 */
	scaffolds(ctx: ScaffoldContext): ScaffoldFile[]
}
