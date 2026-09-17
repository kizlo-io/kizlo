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
	 * Run the dev stack under `kizlo dev`. Off unless set to `true`; `local: true` is the shorthand that
	 * turns both stacks on. Leave it off to keep the stack configured while `kizlo dev` runs the contract
	 * watcher alone (for example when only `kizlo test` boots local WordPress).
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
	 * Run the test stack under `kizlo test`. Off unless set to `true`; `local: true` is the shorthand that
	 * turns both stacks on. Leave it off and `kizlo test` just runs the project's own test script without
	 * booting local WordPress.
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
	 * Master switch for local Docker WordPress (default `true` in this object form). Set `false` to keep
	 * the stacks configured but off, the same as omitting `local` entirely. Each stack is still off until
	 * its own `enable: true` — see {@link KizloDevConfig.enable} and {@link KizloTestConfig.enable}.
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

export interface KizloMcpConfig {
	/**
	 * Port the server binds on `127.0.0.1`. Unset, it starts at the Kizlo default and steps off a
	 * collision, which is why nothing has to be configured to run two projects at once. Set it when a
	 * harness config has to name the port: an explicitly set port is never auto-reassigned, and
	 * `kizlo dev` stops rather than serving on one you did not choose.
	 * @default 8300
	 */
	port?: number
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
	 * Local Docker WordPress, off unless set. `true` enables both the dev and test stacks with defaults;
	 * the object form configures them, with each stack off until its own `enable: true`, and is where the
	 * stack name, the per-branch `worktrees` toggle, and the two stacks live.
	 */
	local?: boolean | KizloLocalConfig

	/**
	 * The MCP server `kizlo dev` serves on loopback, exposing this project's WordPress routes to an AI
	 * harness. It runs whenever `kizlo dev` can resolve a WordPress connection; this block only tunes it.
	 * It is never part of a built app: the server lives in the CLI, so nothing about it can be deployed.
	 */
	mcp?: KizloMcpConfig
}

export function defineConfig(config: KizloGlobalConfig): KizloGlobalConfig {
	return config
}
