import { DEFAULT_PLUGINS, DEFAULT_PORT, SEED_MARKER_OPTION, SEED_VERSION, TEST_ADMIN, TEST_USER } from "./constants"
import { compose, composeUp, wpCli } from "./docker"
import type { Fixture, TestCredentials } from "./types"
import { ensurePlugin, resolvePluginSource } from "./utils"

export interface BootstrapConfig {
	/** Published WP port (default 8080). */
	port?: number
	/** Extension fixtures to install + seed. */
	fixtures?: Fixture[]
}

async function seedUsers(): Promise<number> {
	const existing = await wpCli(["user", "get", TEST_USER.username, "--field=ID"]).catch(() => "")
	const id = existing
		? existing
		: await wpCli([
				"user",
				"create",
				TEST_USER.username,
				TEST_USER.email,
				`--role=${TEST_USER.role}`,
				`--user_pass=${TEST_USER.password}`,
				"--porcelain",
			])
	if (!id) throw new Error('seed/users.json must include a user with username "user"')
	return Number(id)
}

async function createAdminAppPassword(): Promise<string> {
	await compose(["exec", "-T", "wp-cli", "wp", "user", "application-password", "delete", TEST_ADMIN.username, "--all"])
	return wpCli(["user", "application-password", "create", TEST_ADMIN.username, "harness", "--porcelain"])
}

/**
 * Phase 1 — boot WordPress via docker + wp-cli: core install, plugins (kizlo core +
 * each fixture's plugin), the base users, the admin app password, and the seed
 * marker. Content (posts/menu) is left to fixtures. Returns everything needed to
 * construct the REST client in Phase 2.
 */
export async function bootstrapWp(config: BootstrapConfig): Promise<TestCredentials> {
	const port = config.port ?? DEFAULT_PORT
	const url = `http://localhost:${port}`
	process.env.WP_PORT = String(port)

	await composeUp()

	const installed = await compose(["exec", "-T", "wp-cli", "wp", "core", "is-installed"])
	if (installed.code !== 0) {
		await wpCli([
			"core",
			"install",
			`--url=${url}`,
			"--title=Kizlo Test",
			`--admin_user=${TEST_ADMIN.username}`,
			`--admin_password=${TEST_ADMIN.password}`,
			`--admin_email=${TEST_ADMIN.email}`,
			"--skip-email",
		])
	}

	await wpCli(["rewrite", "structure", "/%postname%/", "--hard"])

	for (const plugin of [...DEFAULT_PLUGINS, ...(config.fixtures?.flatMap((a) => a.plugins ?? []) ?? [])]) {
		await ensurePlugin(...resolvePluginSource(plugin))
	}

	const adminId = Number(await wpCli(["user", "get", TEST_ADMIN.username, "--field=ID"]))
	const userId = await seedUsers()
	const appPassword = await createAdminAppPassword()

	// Final step: stamp the DB so `isSeeded` can detect a completed bootstrap.
	await wpCli(["option", "update", SEED_MARKER_OPTION, SEED_VERSION, "--autoload=no"])

	return {
		url,
		users: {
			admin: { id: adminId, ...TEST_ADMIN, applicationPassword: appPassword },
			user: { id: userId, ...TEST_USER },
		},
		fixtures: {},
	}
}
