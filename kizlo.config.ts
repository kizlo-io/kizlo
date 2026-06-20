import { cf7 } from "@kizlo/cf7/test"
import { woocommerce } from "@kizlo/woocommerce/test"
import { defineConfig } from "kizlo/config"
import { coreFixtures } from "kizlo/test"

// Test environment for the monorepo's own suites. `kizlo wp` / `kizlo test`
// install + seed these fixtures on top of the base WordPress stack. The core
// fixtures (posts/menu) are opt-in content for kizlo's own suites.
export default defineConfig({
	test: {
		fixtures: [...coreFixtures, woocommerce(), cf7()],
	},
})
