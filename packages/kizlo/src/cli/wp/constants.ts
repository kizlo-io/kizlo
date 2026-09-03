import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { PluginSource, TestAdminUser, TestUser } from "./types"

export const DEFAULT_PORT = 8080

/**
 * WordPress image tag the stacks boot when `dev.version` / `test.version` is unset, kept in step
 * with the `image:` default in `compose/docker-compose.yml`. Compose reads that file's default when
 * it runs standalone; every path through the CLI supplies this one as `WP_IMAGE_TAG`.
 *
 * `latest` on purpose: a project that has said nothing about WordPress wants current WordPress, and
 * a version baked in here would decide for every consumer at the moment Kizlo was published. A
 * project that needs the version to hold still says so with `dev.version` / `test.version`.
 */
export const DEFAULT_WORDPRESS_TAG = "latest"

/** Build a GitHub release-zip URL for `PluginSource.source` (asset named `<tag>.zip`). */
export function githubRelease(repo: string, tag: string): string {
	return `https://github.com/${repo}/releases/download/${tag}/${tag}.zip`
}

/**
 * Download URL for a Kizlo plugin's latest release, served by kizlo.io (it 302s to
 * the current GitHub release asset). Always tracks the newest published version —
 * use {@link githubRelease} instead to pin a specific tag.
 */
export function kizloRelease(slug: string): string {
	return `https://kizlo.io/plugins/${slug}/download`
}

const HERE = dirname(fileURLToPath(import.meta.url))

/** The docker-compose file shipped alongside this module (in both `src/` and `dist/`). */
export const COMPOSE_FILE = resolve(HERE, "compose/docker-compose.yml")
/** PHP OPcache config, shipped alongside this module and bind-mounted into the local WordPress. */
export const OPCACHE_INI = resolve(HERE, "compose/opcache.ini")
/** Linux-only entrypoint that retags www-data to the host user (see the script for why). */
export const REMAP_ENTRYPOINT = resolve(HERE, "compose/remap-entrypoint.sh")
export const CONFIG_FILES = ["kizlo.config.ts", "kizlo.config.js", "kizlo.config.mjs"]

/** Test connection artifact location, relative to the config root. */
export const CREDENTIALS_REL = ".kizlo/test.json"

/**
 * ETag of the last introspection fetch, relative to the config root. It lives in the gitignored
 * working dir rather than next to the generated files on purpose: it describes one machine's last
 * fetch, so a fresh clone has to regenerate rather than trust a cache it never populated.
 */
export const INTROSPECTION_META_REL = ".kizlo/introspection.meta.json"

/**
 * Fixed folder the local WordPress install lives in, relative to the config root. The whole install
 * (core, themes, uploads, plugins) is bind-mounted here; `kizlo dev reset` wipes it. It sits under
 * `.kizlo/` — the single gitignored working dir — so there's no folder to choose or configure.
 */
export const LOCAL_DIR_REL = ".kizlo/local"

/**
 * DB-side marker written as the final bootstrap step and checked by `isSeeded`.
 * It records that this database holds a completed bootstrap — independent of any
 * fixture content, which is optional and varies per consumer. Bump `SEED_VERSION`
 * to force a reseed when the bootstrap contract changes.
 */
export const SEED_MARKER_OPTION = "kizlo_test_seeded"
export const SEED_VERSION = "1"

/** The kizlo core WordPress plugin, always installed during bootstrap. */
export const DEFAULT_PLUGINS: PluginSource[] = [
	{
		name: "kizlo",
		source: kizloRelease("kizlo"),
	},
]

export const TEST_ADMIN: Omit<TestAdminUser, "id" | "applicationPassword"> = {
	firstName: "Admin",
	lastName: "",
	username: "admin",
	password: "admin",
	email: "admin@example.com",
}

export const TEST_USER: Omit<TestUser, "id"> = {
	firstName: "User",
	lastName: "",
	username: "user",
	email: "user@example.com",
	password: "user_pass",
	role: "subscriber",
}
