import type { BrandSettings } from "@kizlo/shared"
import { describe, expect, test } from "vitest"
import type { S2SClient } from "../../kizlo"
import type { SeoHead } from "../../seo/schema"
import { createHomeMetadata, createRootViewport } from "./metadata"

function clientWithBrand(brand: Partial<BrandSettings>): S2SClient<[]> {
	return { settings: { get: { call: async () => ({ brand }) } } } as unknown as S2SClient<[]>
}

function clientWithHomepageHead(head: Partial<SeoHead>): S2SClient<[]> {
	return { seo: { homepage: { call: async () => ({ head }) } } } as unknown as S2SClient<[]>
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

describe("createHomeMetadata", () => {
	const head: SeoHead = {
		title: "Home",
		canonical: "https://example.com/",
		robots: {
			index: "index",
			follow: "follow",
			maxSnippet: "max-snippet:-1",
			maxImagePreview: "max-image-preview:large",
			maxVideoPreview: "max-video-preview:-1",
		},
		og: {
			locale: "en_US",
			type: "website",
			title: "Home",
			url: "https://example.com/",
			siteName: "Acme",
			description: "Welcome",
			image: null,
		},
		twitter: { card: "summary", title: "Home", site: null, creator: null, description: "Welcome", image: null, imageAlt: null },
		article: null,
	}

	test("resolves the homepage head from the client and maps it to page metadata", async () => {
		const metadata = await createHomeMetadata(clientWithHomepageHead(head))()
		expect(metadata.title).toEqual({ absolute: "Home" })
		expect(metadata.alternates?.canonical).toBe("https://example.com/")
		expect(metadata.description).toBe("Welcome")
	})
})
