import type { Fixture } from "./test"

/**
 * Where Kizlo generates, and what it watches. A string is the home directory Kizlo owns the layout
 * under: sources in `<dir>/server`, and the generated files (`contract.json`, the barrel, and
 * `introspection.ts`) under `<dir>/server/generated`. The object form sets each path on its own. Omit
 * `server` and there are no sources to watch and no contract is built, so only the introspection is
 * generated (the shape a package that ships procedures but no server takes).
 */
export type KizloDir =
	| string
	| {
			/** Server sources (extensions and procedures). Watched by `kizlo dev`; its presence is what builds a contract. */
			server?: string
			/** Where `contract.json` and the generated barrel are written. Defaults to `generated/` under `server`. */
			contract?: string
			/** Where the generated `introspection.ts` is written. Defaults to `generated/` under `server`. */
			introspection?: string
	  }

export interface KizloDevConfig {
	/**
	 * Run the dev stack. On by default when local WordPress is enabled; set `false` to keep local
	 * WordPress on for `kizlo test` while `kizlo dev` runs the contract watcher alone.
	 */
	enable?: boolean

	/** Published WP port (default 8080). */
	port?: number

	/**
	 * WordPress version the local stack boots, given as the tag after `wordpress:` on Docker
	 * Hub: a bare version (`"7.1.0"`), or a full tag (`"7.1.0-php8.3-apache"`) when you need
	 * a specific PHP. Defaults to `latest`, so an unconfigured project gets current WordPress.
	 *
	 * Worth setting once you commit a generated introspection, which is derived from
	 * whatever the stack serves: on `latest` that introspection goes stale the day WordPress ships.
	 *
	 * An existing install keeps the core files it was provisioned with, so changing this
	 * takes effect on the next `kizlo dev reset` and Kizlo says so when the two disagree.
	 */
	version?: string

	/**
	 * Host port the local WordPress MySQL is published on (default 3307), bound to `127.0.0.1` so
	 * you can point a SQL client (TablePlus, DBeaver, `mysql`) at the database to
	 * inspect or edit tables directly. Connect with db `wordpress`, user `wordpress`,
	 * password `wppass`. Pick a port that's free; change it if you run multiple projects
	 * or already have MySQL on the default.
	 */
	dbPort?: number

	/**
	 * Code-defined seed data for a **fresh** local WordPress. These are the same {@link Fixture}s the
	 * test environment uses, so you can populate your local site from versioned code instead of a
	 * blank install. Each fixture also declares the plugins it needs as wp.org slugs or zip
	 * sources to install, or `{ path }` local directories bind-mounted live so your edits
	 * show up without a reinstall, which `kizlo dev` ensures every run. Each fixture's
	 * `seed` runs once over REST (and may drop to wp-cli) on the first `kizlo dev` and
	 * after `kizlo dev reset`; an existing install is left alone.
	 */
	fixtures?: Fixture[]
}

export interface KizloTestConfig {
	/**
	 * Run the test stack. On by default when local WordPress is enabled; set `false` to keep local
	 * WordPress on for `kizlo dev` while `kizlo test` just runs the project's own test script.
	 */
	enable?: boolean

	/**
	 * Fall back to the dev stack's `version` and `fixtures` when this stack leaves them unset (default
	 * `true`), so the two stacks a local-WordPress project always wants together are declared once.
	 * Set `false` to configure the test stack independently, taking Kizlo's defaults where it is silent.
	 */
	inherit?: boolean

	/** Published WP port (default 8889). */
	port?: number

	/**
	 * WordPress version the local stack boots, given as the tag after `wordpress:` on Docker
	 * Hub. Falls back to the dev stack's `version` unless `inherit` is `false`; defaults to `latest`.
	 */
	version?: string

	/** Integration fixtures to install + seed. Falls back to the dev stack's `fixtures` unless `inherit` is `false`. */
	fixtures?: Fixture[]

	/**
	 * Package manager used to launch the test script (default: auto-detected from
	 * the lockfile / package.json `packageManager`).
	 */
	packageManager?: "npm" | "pnpm" | "yarn" | "bun"

	/**
	 * Override the test command entirely. Default: `<packageManager> test` (the
	 * project's own `test` script, never hardcoded to Vitest).
	 */
	command?: string
}

export interface KizloLocalConfig {
	/**
	 * Enable local Docker WordPress (default `true` in this object form). Set `false` to keep the
	 * stacks configured but off, the same as omitting `local` entirely.
	 */
	enable?: boolean

	/**
	 * Base name for the local Docker stacks (`kizlo-<name>-dev`, `kizlo-<name>-test`). Defaults
	 * to the sanitized `package.json` name, falling back to the config dir basename.
	 */
	name?: string

	/**
	 * Give each branch its own local Docker stacks, by appending the checked-out branch to
	 * {@link KizloLocalConfig.name} (`kizlo-<name>-<branch>-dev`). Off unless set, since the stacks it
	 * isolates are the ones an existing project is already using.
	 *
	 * Turn it on when you work in several checkouts at once, typically git worktrees: without it
	 * every checkout of a project resolves to one stack, so parallel `kizlo dev` and `kizlo test`
	 * runs share a single WordPress and a single database while appearing to be separate.
	 *
	 * A detached `HEAD` names no branch and keeps the unsuffixed stack.
	 */
	worktrees?: boolean

	/** The dev stack run by `kizlo dev`. */
	dev?: KizloDevConfig

	/** The test stack run by `kizlo test`. Inherits `version` and `fixtures` from {@link KizloLocalConfig.dev}. */
	test?: KizloTestConfig
}

export interface KizloGlobalConfig {
	/**
	 * Where Kizlo generates, and what it watches. A string names the home directory Kizlo owns the
	 * layout under; the object form sets the server, contract, and introspection paths independently.
	 * @default 'src/lib/kizlo' (or 'lib/kizlo' without a src dir)
	 */
	dir?: KizloDir

	/**
	 * Import alias prefix for generated imports (e.g. `@`). Recorded by `kizlo init`
	 * from your `--alias` flag or its prompt, so later runs reuse it instead of asking
	 * again; an empty string (`""`) is the recorded choice to use relative imports.
	 */
	alias?: string

	/**
	 * Local Docker WordPress, off unless set. `true` enables both the dev and test stacks with
	 * defaults; the object form enables and configures them, and is where the stack name, the
	 * per-branch `worktrees` toggle, and the two stacks live.
	 */
	local?: boolean | KizloLocalConfig
}

export function defineConfig(config: KizloGlobalConfig): KizloGlobalConfig {
	return config
}
