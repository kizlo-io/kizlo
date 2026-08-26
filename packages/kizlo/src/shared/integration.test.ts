import { describe, expect, it } from "vitest"
import { assertIntegrationEndpoints, assertIntegrationEnv, createIntegration, missingEndpoints, missingEnv } from "./integration"

const endpoints = {
	woocommerce: {
		customers: { retrieve: {} },
		store: { cart: { get: {} }, products: { list: {} } },
	},
}

const integration = createIntegration({
	id: "woocommerce",
	requires: {
		plugins: [{ name: "kizlo-woocommerce", version: "0.2.0" }],
		endpoints: ["woocommerce.store.cart", "woocommerce.store.checkout"],
	},
})

describe("missingEndpoints", () => {
	it("finds nothing when every subtree is present", () => {
		expect(missingEndpoints(endpoints, ["woocommerce.customers", "woocommerce.store.cart"])).toEqual([])
	})

	it("reports a subtree the tree does not have", () => {
		expect(missingEndpoints(endpoints, ["woocommerce.store.checkout"])).toEqual(["woocommerce.store.checkout"])
	})

	it("reports a subtree whose parent is missing", () => {
		expect(missingEndpoints(endpoints, ["cf7.forms.submit"])).toEqual(["cf7.forms.submit"])
	})

	it("reports everything against an empty tree", () => {
		expect(missingEndpoints({}, ["woocommerce.store.cart", "woocommerce.products"])).toEqual([
			"woocommerce.store.cart",
			"woocommerce.products",
		])
	})
})

describe("integration environment requirements", () => {
	it("finds missing and blank values", () => {
		expect(missingEnv({ PRESENT: "value", BLANK: "  " }, ["PRESENT", "BLANK", "ABSENT"])).toEqual(["BLANK", "ABSENT"])
	})

	it("reads nested requirements by dotted path", () => {
		expect(
			missingEnv({ remote: { wordpressUrl: "https://wp.example", siteSecret: " " } }, ["remote.wordpressUrl", "remote.siteSecret"]),
		).toEqual(["remote.siteSecret"])
	})

	it("passes when every required value is contributed", () => {
		const satisfied = createIntegration({ id: "provider", requires: { env: ["providerSecret"] } })

		expect(() => assertIntegrationEnv(satisfied, { providerSecret: "secret" })).not.toThrow()
	})

	it("names the integration and every missing value", () => {
		const required = createIntegration({ id: "provider", requires: { env: ["providerSecret", "providerRegion"] } })

		expect(() => assertIntegrationEnv(required, {})).toThrow(
			'The "provider" integration requires environment values that are missing: providerSecret, providerRegion.',
		)
	})
})

describe("assertIntegrationEndpoints", () => {
	it("passes when the tree carries what the integration declared", () => {
		const satisfied = createIntegration({ id: "woocommerce", requires: { endpoints: ["woocommerce.store.cart"] } })

		expect(() => assertIntegrationEndpoints(satisfied, endpoints)).not.toThrow()
	})

	it("passes when the integration declares nothing", () => {
		expect(() => assertIntegrationEndpoints(createIntegration({ id: "bare" }), {})).not.toThrow()
	})

	it("names the missing subtree and the plugin that would serve it", () => {
		expect(() => assertIntegrationEndpoints(integration, endpoints)).toThrow(/woocommerce\.store\.checkout/)
		expect(() => assertIntegrationEndpoints(integration, endpoints)).toThrow(/kizlo-woocommerce 0\.2\.0\+/)
	})

	it("names only what is missing, not everything it declared", () => {
		expect(() => assertIntegrationEndpoints(integration, endpoints)).not.toThrow(/woocommerce\.store\.cart,/)
	})

	it("falls back to generate guidance when no plugin is named", () => {
		const anonymous = createIntegration({ id: "custom", requires: { endpoints: ["nope.gone"] } })

		expect(() => assertIntegrationEndpoints(anonymous, {})).toThrow(/kizlo generate/)
	})
})
