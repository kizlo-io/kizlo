import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { WordPressService } from "../../wordpress"
import { type BootstrapConfig, bootstrapWp } from "./bootstrap"
import type { SeedContext } from "./types"
import { credentialsPath } from "./utils"

/**
 * Phase 2 — after bootstrap, build a `SeedContext` and run each `Fixture.seed`
 * over REST, collecting namespaced fixtures, then write the credentials artifact
 * at `<config-dir>/.kizlo/test-credentials.json`. Returns a teardown that runs
 * each fixture's `cleanup`.
 */
export async function runSeeds(config: BootstrapConfig): Promise<() => Promise<void>> {
	const boot = await bootstrapWp(config)

	const service = new WordPressService({
		credentials: {
			url: boot.url,
			username: boot.users.admin.username,
			password: boot.users.admin.applicationPassword,
		},
	})

	const ctx: SeedContext = {
		service,
		userId: boot.users.user.id,
		adminId: boot.users.admin.id,
	}

	for (const fixture of config.fixtures ?? []) {
		if (fixture.seed) boot.fixtures[fixture.name] = await fixture.seed(ctx)
	}

	const path = credentialsPath()
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, `${JSON.stringify({ url: boot.url, users: boot.users, fixtures: boot.fixtures }, null, 2)}\n`)

	return async () => {
		for (const fixture of config.fixtures ?? []) await fixture.cleanup?.(ctx)
	}
}
