import type { WordPressService } from "../../wordpress"

interface BaseTestUser {
	id: number
	email: string
	firstName: string
	lastName: string
	username: string
	password: string
}

export interface TestAdminUser extends BaseTestUser {
	applicationPassword: string
}

export interface TestUser extends BaseTestUser {
	role: "subscriber"
}

/** Any JSON-serializable value — the artifact is written via `JSON.stringify`. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

/**
 * Shape of the credentials artifact written by `runSeeds` and consumed by
 * `getKizloTestInstance`. The contract between the CLI writer and the test reader
 * is this JSON file — neither side imports the other at runtime.
 */
export interface TestCredentials {
	url: string
	users: {
		user: TestUser
		admin: TestAdminUser
	}
	/**
	 * Per-fixture handles, keyed by `Fixture.name`. By convention each fixture
	 * stores the ids (or codes/slugs) of what it created — handles to re-fetch the
	 * live resource — not full snapshots, which would drift from WP state.
	 */
	fixtures: Record<string, Record<string, JsonValue>>
}

/** Handed to each `Fixture` so it can create its world over REST (or wp-cli). */
export interface SeedContext {
	service: WordPressService
	adminId: number
	userId: number
}

/**
 * A plugin to ensure installed + active during bootstrap. A bare string is a
 * wp.org slug (the installed name and the install source are the same). The
 * object form is for any other source — a zip URL or a local path — where the
 * installed slug (`name`, used for activation checks) can't be derived from the
 * source. `source` is passed straight to `wp plugin install`.
 */
export type PluginSource = string | { name: string; source: string }

/** The serializable test layer an extension ships alongside its live extension. */
export interface Fixture {
	/** Namespace key under `TestCredentials.fixtures`. */
	name: string
	/** Plugins to install + activate via wp-cli during bootstrap, in order (deps first). */
	plugins?: PluginSource[]
	/** Build this extension's world once during seeding; return created handles. */
	seed?: (ctx: SeedContext) => Promise<Record<string, JsonValue>>
	/** Revert per-test mutations (teardown); does NOT uninstall plugins or seeded data. */
	cleanup?: (ctx: SeedContext) => Promise<void>
}

/** Identity helper for authoring a `Fixture` with full inference and autocomplete. */
export function defineFixture(fixture: Fixture): Fixture {
	return fixture
}
