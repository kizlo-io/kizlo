import type { BrandSettings } from "@kizlo/shared"
import { describe, expect, test } from "vitest"
import type { S2SClient } from "../../kizlo"
import { createRootViewport } from "./metadata"

// Stub client: createRootViewport only calls `client.settings.get.call()`.
function clientWithBrand(brand: Partial<BrandSettings>): S2SClient<[]> {
	return { settings: { get: { call: async () => ({ brand }) } } } as unknown as S2SClient<[]>
}

describe("createRootViewport", () => {
	test("emits no theme-color when neither color is set", async () => {
		const viewport = await createRootViewport(clientWithBrand({}))()
		expect(viewport).toEqual({})
	})

	test("emits a single flat theme-color when only the light color is set", async () => {
		const viewport = await createRootViewport(clientWithBrand({ theme_color: "#112233" }))()
		expect(viewport).toEqual({ themeColor: [{ color: "#112233" }] })
	})

	test("emits media-scoped light and dark entries when both are set", async () => {
		const viewport = await createRootViewport(clientWithBrand({ theme_color: "#ffffff", theme_color_dark: "#000000" }))()
		expect(viewport).toEqual({
			themeColor: [
				{ media: "(prefers-color-scheme: light)", color: "#ffffff" },
				{ media: "(prefers-color-scheme: dark)", color: "#000000" },
			],
		})
	})

	test("emits only the dark entry when just the dark color is set", async () => {
		const viewport = await createRootViewport(clientWithBrand({ theme_color_dark: "#000000" }))()
		expect(viewport).toEqual({ themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#000000" }] })
	})
})
