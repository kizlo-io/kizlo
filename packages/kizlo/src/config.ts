import type { Fixture } from "./test"

export interface KizloDevConfig {
	/**
	 * Folder where your local WordPress install lives, relative to the config dir.
	 * The entire install (core, themes, uploads, plugins) is bind-mounted here, so
	 * you browse and edit every file from your file manager and your changes are
	 * live. This is your persistent dev site — pick a real, visible folder (e.g.
	 * `"wordpress"`), not a hidden one, and don't delete it. `reset` wipes it.
	 */
	path: string

	/** Published WP port (default 8080). */
	port?: number

	/**
	 * Adopt an existing WordPress site instead of provisioning a blank one. Points at a
	 * `.tar.gz` archive (path relative to the config dir) whose root holds a `wordpress/`
	 * directory (the install) and a single `.sql` dump (the database). Applied when the
	 * stack is fresh — the first `kizlo dev`, or after a `kizlo dev reset` — and ignored
	 * once the stack is provisioned. Keep the archive outside `path` (reset wipes that).
	 */
	byo?: string

	/**
	 * Host port the dev MySQL is published on (default 3307), bound to `127.0.0.1` so
	 * you can point a SQL client (TablePlus, DBeaver, `mysql`) at the database to
	 * inspect or edit tables directly. Connect with db `wordpress`, user `wordpress`,
	 * password `wppass`. Pick a port that's free — change it if you run multiple stacks
	 * or already have MySQL on the default.
	 */
	dbPort?: number

	/**
	 * Code-defined seed data for a **fresh** dev stack — the same {@link Fixture}s the
	 * test stack uses, so you can populate your dev site from versioned code instead of a
	 * blank install. Each fixture also declares the plugins it needs — wp.org slugs / zip
	 * sources to install, or `{ path }` local directories bind-mounted live so your edits
	 * show up without a reinstall — which the dev stack ensures every run. Each fixture's
	 * `seed` runs once over REST (and may drop to wp-cli) on the first `kizlo dev` and
	 * after `kizlo dev reset`; existing stacks are left alone. Mutually exclusive with
	 * {@link byo} (which brings its own data).
	 */
	fixtures?: Fixture[]
}

export interface KizloTestConfig {
	/** Published WP port (default 8889). */
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

	/**
	 * Base name for the local Docker stacks (`<name>-dev`, `<name>-test`). Defaults
	 * to the sanitized `package.json` name, falling back to the config dir basename.
	 */
	name?: string

	/** Local WordPress dev stack used by `kizlo dev`. */
	dev?: KizloDevConfig

	/** WordPress test environment used by `kizlo test`. */
	test?: KizloTestConfig
}

export function defineConfig(config: KizloGlobalConfig): KizloGlobalConfig {
	return config
}
