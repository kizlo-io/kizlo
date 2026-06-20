import type { Fixture } from "./test"

export interface KizloTestConfig {
	/** Published WP port (default 8080). */
	port?: number
	/** Extension fixtures to install + seed. */
	fixtures?: Fixture[]
	/**
	 * Package manager used to launch the test script (default: auto-detected from
	 * the lockfile / package.json `packageManager`).
	 */
	packageManager?: "npm" | "pnpm" | "yarn" | "bun"
	/**
	 * Override the test command entirely. Default: `<packageManager> test` (the
	 * project's own `test` script — never hardcoded to vitest).
	 */
	command?: string
}

export interface KizloGlobalConfig {
	/**
	 * Kizlo's home directory. Kizlo owns the layout inside it: your server
	 * (`server/`, whose `index.ts` exports `router` plus your extensions), the
	 * browser `client.ts`, and the generated contract.
	 * @default 'src/lib/kizlo' (or 'lib/kizlo' without a src dir)
	 */
	dir?: string

	/**
	 * Import alias prefix for generated imports (e.g. `@`). Detected from
	 * tsconfig at init; omit (or empty) to use relative imports.
	 */
	alias?: string

	/** WordPress test environment used by `kizlo wp` and `kizlo test`. */
	test?: KizloTestConfig
}

export function defineConfig(config: KizloGlobalConfig): KizloGlobalConfig {
	return config
}
