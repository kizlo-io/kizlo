import { cf7 } from "@kizlo/cf7/test"
import { woocommerce } from "@kizlo/woocommerce/test"
import { defineConfig } from "kizlo/config"
import { coreFixtures, defineFixture } from "kizlo/test"

export default defineConfig({
	test: {
		fixtures: [
			defineFixture({ name: "kizlo-core", plugins: [{ path: "plugins/kizlo" }] }),
			...coreFixtures,
			woocommerce({ plugins: ["woocommerce", { path: "plugins/kizlo-woocommerce" }] }),
			cf7({ plugins: ["contact-form-7", { path: "plugins/kizlo-cf7" }] }),
		],
	},
})
