import type { BrandSettings, Settings } from "@kizlo/shared"
import { describe, expect, test } from "vitest"
import { buildWebManifest } from "./manifest"

const EMPTY_BRAND: BrandSettings = {
	logo: null,
	logo_dark: null,
	logo_icon: null,
	logo_icon_dark: null,
	logo_wordmark: null,
	logo_wordmark_dark: null,
	favicon: null,
	favicon_dark: null,
	ios_app_icon: null,
	android_app_icon: null,
	theme_color: null,
	theme_color_dark: null,
	background_color: null,
}

interface SettingsOverrides {
	site?: Partial<Settings["site"]>
	identity?: Settings["identity"]
	brand?: Partial<BrandSettings>
}

function settings({ site, identity, brand }: SettingsOverrides = {}): Settings {
	return {
		site: { name: null, alternate_name: null, url: null, ...site },
		brand: { ...EMPTY_BRAND, ...brand },
		identity: identity ?? { type: "none" },
	} as unknown as Settings
}

describe("buildWebManifest", () => {
	test("emits the install fields Chrome requires", () => {
		const manifest = buildWebManifest(settings({ site: { name: "Acme" } }))
		expect(manifest).toMatchObject({ id: "/", start_url: "/", scope: "/", display: "standalone" })
	})

	test("falls back name → organization → site name for short_name", () => {
		const manifest = buildWebManifest(
			settings({
				site: { name: null, alternate_name: null },
				identity: { type: "organization", organization: { name: "Acme Inc" } } as never,
			}),
		)
		expect(manifest.name).toBe("Acme Inc")
		expect(manifest.short_name).toBe("Acme Inc")
	})

	test("prefers the alternate name for short_name", () => {
		const manifest = buildWebManifest(settings({ site: { name: "Acme Corporation", alternate_name: "Acme" } }))
		expect(manifest.name).toBe("Acme Corporation")
		expect(manifest.short_name).toBe("Acme")
	})

	test("omits colors when the brand has not set them", () => {
		const manifest = buildWebManifest(settings())
		expect(manifest.theme_color).toBeUndefined()
		expect(manifest.background_color).toBeUndefined()
	})

	test("carries the light colors when set, and never the dark theme variant", () => {
		const manifest = buildWebManifest(
			settings({ brand: { theme_color: "#111111", theme_color_dark: "#eeeeee", background_color: "#222222" } }),
		)
		expect(manifest.theme_color).toBe("#111111")
		expect(manifest.background_color).toBe("#222222")
		expect(JSON.stringify(manifest)).not.toContain("#eeeeee")
	})

	test("resolves manifest icons from the brand", () => {
		const manifest = buildWebManifest(
			settings({
				brand: { logo_icon: { id: 1, name: "", alt: "", src: "https://cdn.test/icon.png", mime: "image/png", width: 512, height: 512 } },
			}),
		)
		expect(manifest.icons).toEqual([{ src: "https://cdn.test/icon.png", type: "image/png", sizes: "512x512" }])
	})
})
