import type { Fixture } from "./test"

export interface KizloDevConfig {
	/**
	 * Run local WordPress under `kizlo dev`. When `true`, `kizlo dev` boots a Docker WordPress in
	 * `.kizlo/local` alongside the contract watcher; when unset or `false`, it runs the watcher alone
	 * (for a project pointing at your own WordPress). Set for you by `kizlo create` / `kizlo init`
	 * when you choose local WordPress.
	 */
	local?: boolean

	/** Published WP port (default 8080). */
	port?: number

	/**
	 * Host port the local WordPress MySQL is published on (default 3307), bound to `127.0.0.1` so
	 * you can point a SQL client (TablePlus, DBeaver, `mysql`) at the database to
	 * inspect or edit tables directly. Connect with db `wordpress`, user `wordpress`,
	 * password `wppass`. Pick a port that's free — change it if you run multiple projects
	 * or already have MySQL on the default.
	 */
	dbPort?: number

	/**
	 * Code-defined seed data for a **fresh** local WordPress — the same {@link Fixture}s the
	 * test environment uses, so you can populate your local site from versioned code instead of a
	 * blank install. Each fixture also declares the plugins it needs — wp.org slugs / zip
	 * sources to install, or `{ path }` local directories bind-mounted live so your edits
	 * show up without a reinstall — which `kizlo dev` ensures every run. Each fixture's
	 * `seed` runs once over REST (and may drop to wp-cli) on the first `kizlo dev` and
	 * after `kizlo dev reset`; an existing install is left alone.
	 */
	fixtures?: Fixture[]
}

export interface KizloTestConfig {
	/**
	 * Run local WordPress under `kizlo test`. When `true`, `kizlo test` boots a disposable Docker
	 * WordPress, seeds it, and runs your suite against it; when unset or `false`, `kizlo test` just
	 * runs your project's test script. Set for you by `kizlo create` / `kizlo init` when you choose
	 * local WordPress.
	 */
	local?: boolean
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
	 * Import alias prefix for generated imports (e.g. `@`). Recorded by `kizlo init`
	 * from your `--alias` flag or its prompt, so later runs reuse it instead of asking
	 * again; an empty string (`""`) is the recorded choice to use relative imports.
	 */
	alias?: string

	/**
	 * Base name for the local Docker stacks (`kizlo-<name>-dev`, `kizlo-<name>-test`). Defaults
	 * to the sanitized `package.json` name, falling back to the config dir basename.
	 */
	name?: string

	/**
	 * Directory to write the WordPress client into, as `<wordpressClientDir>/wordpress.ts`. For a package or
	 * workspace that ships procedures but no Kizlo server: there is no router to build a contract from,
	 * yet those procedures still call the generated tree, so they need the client on its own.
	 *
	 * Independent of `dir`. An app leaves this unset and gets its client inside `dir` alongside the
	 * contract; set both only if a project is somehow each of those things at once.
	 */
	wordpressClientDir?: string

	/** Local WordPress and contract watcher run by `kizlo dev`. */
	dev?: KizloDevConfig

	/** WordPress test environment run by `kizlo test`. */
	test?: KizloTestConfig
}

export function defineConfig(config: KizloGlobalConfig): KizloGlobalConfig {
	return config
}
