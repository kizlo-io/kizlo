import { cf7 } from "@kizlo/cf7/test"
import { woocommerce } from "@kizlo/woocommerce/test"
import { defineConfig } from "kizlo/config"
import { coreFixtures, defineFixture } from "kizlo/test"

/** The active plugins whose freshly seeded test contract is committed in both generated WordPress clients. */
const wordpressClientFixtures = [
	...coreFixtures,
	defineFixture({ name: "kizlo-core", plugins: [{ path: "plugins/kizlo" }] }),
	woocommerce({ plugins: ["woocommerce", { path: "plugins/kizlo-woocommerce" }] }),
	cf7({ plugins: ["contact-form-7", { path: "plugins/kizlo-cf7" }] }),
]

/**
 * The WordPress both stacks boot. Pinned rather than left on the `latest` default because this repo
 * commits the generated WordPress clients, which are derived from whatever the stack serves: on a
 * moving tag they go stale the day WordPress ships, and the failure lands on whichever PR runs next
 * instead of on the one that changed something. Bumping this is how a core release enters the repo,
 * as a reviewed diff of the schema it changed.
 */
const WORDPRESS_VERSION = "7.1.0-apache"

export default defineConfig({
	worktrees: true,
	wordpressClientDir: ".",
	dev: { local: true, version: WORDPRESS_VERSION, fixtures: wordpressClientFixtures },
	test: { local: true, version: WORDPRESS_VERSION, fixtures: wordpressClientFixtures },
})
