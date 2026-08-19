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

export default defineConfig({
	worktrees: true,
	wordpressClientDir: ".",
	dev: { local: true, fixtures: wordpressClientFixtures },
	test: { local: true, fixtures: wordpressClientFixtures },
})
