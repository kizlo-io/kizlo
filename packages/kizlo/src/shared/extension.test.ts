import { describe, expect, it } from "vitest"
import { assertExtensionEndpoints, createExtension, missingEndpoints } from "./extension"

const endpoints = {
	woocommerce: {
		customers: { retrieve: {} },
		store: { cart: { get: {} }, products: { list: {} } },
	},
}

const extension = createExtension({
	id: "woocommerce",
	requires: {
		plugin: { slug: "kizlo-woocommerce", name: "Kizlo WooCommerce", version: "0.2.0" },
		endpoints: ["woocommerce.store.cart", "woocommerce.store.checkout"],
	},
	init: () => ({}),
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

describe("assertExtensionEndpoints", () => {
	it("passes when the tree carries what the extension declared", () => {
		const satisfied = createExtension({ id: "woocommerce", requires: { endpoints: ["woocommerce.store.cart"] }, init: () => ({}) })

		expect(() => assertExtensionEndpoints(satisfied, endpoints)).not.toThrow()
	})

	it("passes when the extension declares nothing", () => {
		expect(() => assertExtensionEndpoints(createExtension({ id: "bare", init: () => ({}) }), {})).not.toThrow()
	})

	it("names the missing subtree and the plugin that would serve it", () => {
		expect(() => assertExtensionEndpoints(extension, endpoints)).toThrow(/woocommerce\.store\.checkout/)
		expect(() => assertExtensionEndpoints(extension, endpoints)).toThrow(/Kizlo WooCommerce WordPress plugin \(0\.2\.0\+\)/)
	})

	it("names only what is missing, not everything it declared", () => {
		expect(() => assertExtensionEndpoints(extension, endpoints)).not.toThrow(/woocommerce\.store\.cart,/)
	})

	it("falls back to generate guidance when no plugin is named", () => {
		const anonymous = createExtension({ id: "custom", requires: { endpoints: ["nope.gone"] }, init: () => ({}) })

		expect(() => assertExtensionEndpoints(anonymous, {})).toThrow(/kizlo generate/)
	})
})
