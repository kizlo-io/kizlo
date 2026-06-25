import type { ResolvedDevConfig, ResolvedTestConfig } from "../daemon/config"
import { writeDevOverride, writeTestOverride } from "./compose/override"
import { COMPOSE_FILE } from "./constants"
import type { Stack } from "./docker"
import { type Fixture, isLocalPlugin } from "./types"

/** The local-plugin dirs to bind-mount, gathered from every fixture's `plugins`. */
function localMounts(fixtures: Fixture[]): string[] {
	return fixtures
		.flatMap((fixture) => fixture.plugins ?? [])
		.filter(isLocalPlugin)
		.map((plugin) => plugin.path)
}

/**
 * The test stack: the base compose file under a `<name>-test` project, plus a generated
 * mount override when any fixture carries a local (`{ path }`) plugin — so the same
 * fixtures bind-mount their live plugin source here exactly as in the dev stack.
 */
export function testStack(cfg: ResolvedTestConfig): Stack {
	const mounts = localMounts(cfg.fixtures)
	const composeFiles = mounts.length ? [COMPOSE_FILE, writeTestOverride(cfg.configDir, mounts)] : [COMPOSE_FILE]
	return { project: cfg.project, port: cfg.port, composeFiles }
}

/**
 * The host user to run the dev container as, so bind-mounted files come out owned
 * by you. Only on native Linux, where Docker doesn't remap ownership; `undefined`
 * (a no-op) on macOS/Windows, and when running as root (no benefit).
 */
function detectHostUser(): { uid: number; gid: number } | undefined {
	if (process.platform !== "linux" || typeof process.getuid !== "function") return undefined
	const uid = process.getuid()
	if (uid === 0) return undefined
	const gid = typeof process.getgid === "function" ? process.getgid() : uid
	return { uid, gid }
}

/**
 * The dev stack: the base compose file plus the generated mount override, under a
 * `<name>-dev` project. Building the stack (re)writes the override so it always
 * matches the current `dev.path` and the `dev.fixtures` local plugins.
 */
export function devStack(cfg: ResolvedDevConfig): Stack {
	const override = writeDevOverride(cfg.configDir, {
		wordpressDir: cfg.wordpressDir,
		mounts: localMounts(cfg.fixtures),
		hostUser: detectHostUser(),
		dbPort: cfg.dbPort,
	})
	return { project: cfg.project, port: cfg.port, composeFiles: [COMPOSE_FILE, override] }
}
