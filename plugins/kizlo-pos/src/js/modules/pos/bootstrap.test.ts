import { describe, expect, it } from "vitest"
import { readBootstrap } from "./bootstrap"
import { data } from "./test-data"

describe("WordPress bootstrap", () => {
	it("consumes the served shape and preserves subdirectory URLs", () => {
		expect(readBootstrap(data)).toEqual(data)
	})
	it.each([
		undefined,
		null,
		{},
		{ ...data, nonce: "" },
		{ ...data, urls: { ...data.urls, account: "javascript:alert(1)" } },
		{ ...data, navigation: Array(4).fill(data.navigation[0]) },
	])("rejects missing or invalid initial data: %j", (value) => {
		expect(readBootstrap(value)).toBeNull()
	})
	it("does not copy unrelated server fields into app state", () => {
		expect(readBootstrap({ ...data, password: "must not be consumed" })).not.toHaveProperty("password")
	})
})
