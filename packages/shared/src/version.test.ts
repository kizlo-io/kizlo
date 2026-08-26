import { describe, expect, it } from "vitest"
import { integrationUpdateMessage, isPluginVersionSupported, MIN_PLUGIN_VERSION, parseIntegrationVersions } from "./version"

describe("isPluginVersionSupported", () => {
	it("accepts the exact minimum", () => {
		expect(isPluginVersionSupported(MIN_PLUGIN_VERSION)).toBe(true)
	})

	it("accepts a newer version", () => {
		expect(isPluginVersionSupported("1.0.0")).toBe(true)
		expect(isPluginVersionSupported("0.9.0")).toBe(true)
		expect(isPluginVersionSupported("0.8.2")).toBe(true)
	})

	it("rejects an older version", () => {
		expect(isPluginVersionSupported("0.8.0")).toBe(false)
		expect(isPluginVersionSupported("0.7.9")).toBe(false)
		expect(isPluginVersionSupported("0.0.1")).toBe(false)
	})

	it("ignores pre-release and build suffixes", () => {
		expect(isPluginVersionSupported("0.8.1-alpha.1")).toBe(true)
		expect(isPluginVersionSupported("1.0.0+build.5")).toBe(true)
	})

	it("treats missing or malformed versions as unsupported", () => {
		expect(isPluginVersionSupported(null)).toBe(false)
		expect(isPluginVersionSupported(undefined)).toBe(false)
		expect(isPluginVersionSupported("")).toBe(false)
		expect(isPluginVersionSupported("0.8")).toBe(false)
		expect(isPluginVersionSupported("not-a-version")).toBe(false)
	})
})

describe("parseIntegrationVersions", () => {
	it("reads slug and version pairs", () => {
		expect(parseIntegrationVersions("kizlo-woocommerce=0.2.0,kizlo-cf7=0.1.0")).toEqual({
			"kizlo-woocommerce": "0.2.0",
			"kizlo-cf7": "0.1.0",
		})
	})

	it("tolerates spacing around the pairs", () => {
		expect(parseIntegrationVersions(" kizlo-woocommerce = 0.2.0 ")).toEqual({ "kizlo-woocommerce": "0.2.0" })
	})

	it("returns nothing for an absent or empty header", () => {
		expect(parseIntegrationVersions(null)).toEqual({})
		expect(parseIntegrationVersions(undefined)).toEqual({})
		expect(parseIntegrationVersions("")).toEqual({})
	})

	it("drops a pair it cannot read rather than inventing a version", () => {
		expect(parseIntegrationVersions("kizlo-woocommerce,kizlo-cf7=0.1.0")).toEqual({ "kizlo-cf7": "0.1.0" })
		expect(parseIntegrationVersions("=0.2.0")).toEqual({})
	})
})

describe("integrationUpdateMessage", () => {
	const requirement = { name: "kizlo-woocommerce", version: "0.2.0" }

	it("names the installed version and the one required", () => {
		expect(integrationUpdateMessage(requirement, "0.1.0")).toBe("kizlo-woocommerce plugin outdated (0.1.0). Update to 0.2.0+.")
	})

	it("says so when the plugin is not running at all", () => {
		expect(integrationUpdateMessage(requirement)).toBe("kizlo-woocommerce plugin outdated (not active). Update to 0.2.0+.")
	})
})
