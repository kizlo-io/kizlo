import { describe, expect, it } from "vitest"
import { isPluginVersionSupported, MIN_PLUGIN_VERSION } from "./version"

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
