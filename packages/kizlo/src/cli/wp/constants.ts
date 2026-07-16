import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { PluginSource, TestAdminUser, TestUser } from "./types"

export const DEFAULT_PORT = 8080

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
/** Dev PHP OPcache config, shipped alongside this module and bind-mounted into the dev stack. */
export const OPCACHE_INI = resolve(HERE, "compose/opcache.ini")
/** Linux-only entrypoint that retags www-data to the host user (see the script for why). */
export const REMAP_ENTRYPOINT = resolve(HERE, "compose/remap-entrypoint.sh")
export const CONFIG_FILES = ["kizlo.config.ts", "kizlo.config.js", "kizlo.config.mjs"]

/** Credentials artifact location, relative to the config root. */
export const CREDENTIALS_REL = ".kizlo/test-credentials.json"

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
	password: "admin_pass",
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
