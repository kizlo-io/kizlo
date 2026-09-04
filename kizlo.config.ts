import { cf7 } from "@kizlo/cf7/test"
import { woocommerce } from "@kizlo/woocommerce/test"
import { defineConfig } from "kizlo/config"
import { coreFixtures, defineFixture } from "kizlo/test"

const customField = (definition: Record<string, unknown>) => ({
	key: `field_fixture_${String(definition.name)}`,
	label: String(definition.name),
	instructions: "",
	required: false,
	...definition,
})

const textField = (name: string, defaultValue: string) => customField({ type: "text", name, default: defaultValue })

const numberField = (name: string, defaultValue: number) =>
	customField({ type: "number", name, default: defaultValue, min: null, max: null, step: null })

const toggleField = (name: string, defaultValue: boolean) => customField({ type: "toggle", name, default: defaultValue })

const kizloCore = defineFixture({
	name: "kizlo-core",
	plugins: [{ path: "plugins/kizlo" }],
	async seed({ service }) {
		const definitions = [
			["post_types/post", [textField("company_name", "Kizlo")]],
			["post_types/page", [toggleField("featured", true)]],
			["post_types/product", [textField("product_note", "Fixture product")]],
			["taxonomies/category", [textField("blurb", "Fixture category")]],
			["taxonomies/post_tag", [numberField("rank", 1)]],
		] as const

		for (const [path, custom_fields] of definitions) {
			const response = await service.put(`settings/${path}`, {
				base: "/wp-json/kizlo/v1",
				body: { custom_fields },
			})
			if (response.error) throw response.error
		}

		return {}
	},
})

/** The active plugins whose freshly seeded test contract is committed in the generated introspection. */
const introspectionFixtures = [
	...coreFixtures,
	kizloCore,
	woocommerce({
		plugins: [{ name: "woocommerce", source: "woocommerce", version: "11.0.1" }, { path: "plugins/kizlo-woocommerce" }],
	}),
	cf7({
		plugins: [{ name: "contact-form-7", source: "contact-form-7", version: "6.1.7" }, { path: "plugins/kizlo-cf7" }],
	}),
]

/**
 * The WordPress both stacks boot. Pinned rather than left on the `latest` default because this repo
 * commits the generated introspection, which is derived from whatever the stack serves: on a moving
 * tag it goes stale the day WordPress ships, and the failure lands on whichever PR runs next instead
 * of on the one that changed something. Bumping this is how a core release enters the repo, as a
 * reviewed diff of the schema it changed.
 */
const WORDPRESS_VERSION = "7.1.0-apache"

export default defineConfig({
	dir: { introspection: "." },
	local: {
		worktrees: true,
		dev: { version: WORDPRESS_VERSION, fixtures: introspectionFixtures },
	},
})
