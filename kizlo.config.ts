import { cf7 } from "@kizlo/cf7/test"
import { woocommerce } from "@kizlo/woocommerce/test"
import { defineConfig } from "kizlo/config"
import { coreFixtures, defineFixture } from "kizlo/test"

// One fixture list, shared by `dev` and `test`, so both stacks build the same world.
// Each fixture carries the plugins it needs: wp.org slugs install (woocommerce,
// contact-form-7), and `{ path }` entries bind-mount this repo's three plugins live so
// PHP edits show up without a build/zip step — identical in dev and test. The kizlo core
// plugin is normally installed from its release (DEFAULT_PLUGINS); mounting it locally
// shadows that, so bootstrap sees it already present and just activates the live files.
const fixtures = [
	defineFixture({ name: "kizlo-core", plugins: [{ path: "plugins/kizlo" }] }),
	...coreFixtures,
	woocommerce({ plugins: ["woocommerce", { path: "plugins/kizlo-woocommerce" }] }),
	cf7({ plugins: ["contact-form-7", { path: "plugins/kizlo-cf7" }] }),
]

// The `dev` block drives `kizlo dev` — a long-lived local stack whose whole install lives
// in `dev.path` (`wordpress/`, git-ignored). `kizlo test` runs the same fixtures on the
// throwaway test stack and seeds them for the suites.
export default defineConfig({
	dev: {
		path: "wordpress",
		fixtures,
	},
	test: {
		fixtures,
	},
})
