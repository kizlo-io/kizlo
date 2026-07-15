import type { Media } from "@kizlo/shared"
import { describe, expect, test } from "vitest"
import type { BrandSettings } from "../settings/service.interface"
import { resolveIcons } from "./icons"

function media(mime: string, src = `https://cdn.test/${mime.replace("/", "-")}`, size?: { width: number; height: number }): Media {
	return { id: 1, name: "", alt: "", src, mime, ...size }
}

const EMPTY: BrandSettings = {
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

function brand(overrides: Partial<BrandSettings>): BrandSettings {
	return { ...EMPTY, ...overrides }
}

describe("resolveIcons", () => {
	test("emits nothing when every slot is empty", () => {
		expect(resolveIcons(EMPTY)).toEqual({ icon: [], appleTouch: [], manifestIcons: [] })
	})

	test("tolerates absent slots delivered as undefined rather than null", () => {
		// The response type claims `Media | null`, but a slot missing from the JSON
		// arrives as `undefined`; the raster/manifest guards must not read `.mime` off it.
		const sparse = { ...EMPTY, ios_app_icon: undefined, favicon: undefined } as unknown as BrandSettings
		expect(() => resolveIcons(sparse)).not.toThrow()
		expect(resolveIcons(sparse)).toEqual({ icon: [], appleTouch: [], manifestIcons: [] })
	})

	test("carries the real mime as `type` and tags scalable sources with sizes=any", () => {
		const { icon } = resolveIcons(brand({ favicon: media("image/svg+xml") }))
		expect(icon[0]).toMatchObject({ type: "image/svg+xml", sizes: "any" })
	})

	test("reports a raster favicon's real pixel size when dimensions are known", () => {
		const { icon } = resolveIcons(brand({ favicon: media("image/png", "https://cdn.test/fav", { width: 64, height: 64 }) }))
		expect(icon[0]).toMatchObject({ type: "image/png", sizes: "64x64" })
	})

	test("omits sizes for a .ico favicon (it self-describes)", () => {
		const { icon } = resolveIcons(brand({ favicon: media("image/x-icon") }))
		expect(icon[0]?.sizes).toBeUndefined()
	})

	test("falls back to logo_icon for rel=icon when favicon is empty", () => {
		const result = resolveIcons(brand({ logo_icon: media("image/png") }))
		expect(result.icon).toHaveLength(1)
		expect(result.icon[0]?.type).toBe("image/png")
	})

	test("adds a dark variant with a prefers-color-scheme media query", () => {
		const result = resolveIcons(brand({ favicon: media("image/png"), favicon_dark: media("image/png", "https://cdn.test/dark") }))
		expect(result.icon).toHaveLength(2)
		expect(result.icon[1]).toMatchObject({ url: "https://cdn.test/dark", media: "(prefers-color-scheme: dark)" })
		expect(result.icon[1]?.media).toBe("(prefers-color-scheme: dark)")
	})

	test("emits no dark link when favicon_dark is empty", () => {
		const result = resolveIcons(brand({ favicon: media("image/png") }))
		expect(result.icon).toHaveLength(1)
		expect(result.icon[0]?.media).toBeUndefined()
	})

	describe("apple touch icon (raster guard)", () => {
		test("uses the dedicated iOS slot when it is a raster", () => {
			const result = resolveIcons(brand({ ios_app_icon: media("image/png", "https://cdn.test/apple") }))
			expect(result.appleTouch).toEqual([{ url: "https://cdn.test/apple", type: "image/png", sizes: "any" }])
		})

		test("reports the iOS icon's real size when dimensions are known", () => {
			const result = resolveIcons(brand({ ios_app_icon: media("image/png", "https://cdn.test/apple", { width: 180, height: 180 }) }))
			expect(result.appleTouch).toEqual([{ url: "https://cdn.test/apple", type: "image/png", sizes: "180x180" }])
		})

		test("steps down to a raster favicon when the iOS slot holds an SVG", () => {
			const result = resolveIcons(brand({ ios_app_icon: media("image/svg+xml"), favicon: media("image/png", "https://cdn.test/fav") }))
			expect(result.appleTouch).toEqual([{ url: "https://cdn.test/fav", type: "image/png", sizes: "any" }])
		})

		test("emits nothing when no raster source exists at all", () => {
			const result = resolveIcons(brand({ ios_app_icon: media("image/svg+xml"), favicon: media("image/x-icon") }))
			expect(result.appleTouch).toEqual([])
		})
	})

	describe("manifest icons (raster or SVG)", () => {
		test("emits the logo_icon as the default `any` entry at its true size", () => {
			const result = resolveIcons(brand({ logo_icon: media("image/png", "https://cdn.test/mark", { width: 512, height: 512 }) }))
			expect(result.manifestIcons).toEqual([{ src: "https://cdn.test/mark", type: "image/png", sizes: "512x512" }])
		})

		test("expands a source's generated variants into one entry per real size", () => {
			const source: Media = {
				id: 1,
				name: "",
				alt: "",
				src: "https://cdn.test/full.png",
				mime: "image/png",
				width: 1024,
				height: 1024,
				variants: [
					{ src: "https://cdn.test/192.png", width: 192, height: 192 },
					{ src: "https://cdn.test/512.png", width: 512, height: 512 },
				],
			}
			const result = resolveIcons(brand({ logo_icon: source }))
			expect(result.manifestIcons).toEqual([
				{ src: "https://cdn.test/full.png", type: "image/png", sizes: "1024x1024" },
				{ src: "https://cdn.test/192.png", type: "image/png", sizes: "192x192" },
				{ src: "https://cdn.test/512.png", type: "image/png", sizes: "512x512" },
			])
		})

		test("dedupes renditions that resolve to the same size", () => {
			const source: Media = {
				id: 1,
				name: "",
				alt: "",
				src: "https://cdn.test/full.png",
				mime: "image/png",
				width: 512,
				height: 512,
				variants: [{ src: "https://cdn.test/dup.png", width: 512, height: 512 }],
			}
			const result = resolveIcons(brand({ logo_icon: source }))
			expect(result.manifestIcons).toEqual([{ src: "https://cdn.test/full.png", type: "image/png", sizes: "512x512" }])
		})

		test("adds the Android icon as a separate `maskable` entry", () => {
			const result = resolveIcons(
				brand({
					logo_icon: media("image/png", "https://cdn.test/mark", { width: 512, height: 512 }),
					android_app_icon: media("image/png", "https://cdn.test/mask", { width: 512, height: 512 }),
				}),
			)
			expect(result.manifestIcons).toEqual([
				{ src: "https://cdn.test/mark", type: "image/png", sizes: "512x512" },
				{ src: "https://cdn.test/mask", type: "image/png", sizes: "512x512", purpose: "maskable" },
			])
		})

		test("never marks the `any` source maskable when no Android icon is set", () => {
			const result = resolveIcons(brand({ logo_icon: media("image/png", "https://cdn.test/mark", { width: 512, height: 512 }) }))
			expect(result.manifestIcons.every((i) => i.purpose === undefined)).toBe(true)
		})

		test("emits an SVG source as a single scalable `any` entry", () => {
			const result = resolveIcons(brand({ logo_icon: media("image/svg+xml", "https://cdn.test/mark.svg") }))
			expect(result.manifestIcons).toEqual([{ src: "https://cdn.test/mark.svg", type: "image/svg+xml", sizes: "any" }])
		})

		test("pairs a scalable `any` SVG with a maskable Android icon", () => {
			const result = resolveIcons(
				brand({
					logo_icon: media("image/svg+xml", "https://cdn.test/mark.svg"),
					android_app_icon: media("image/png", "https://cdn.test/mask", { width: 512, height: 512 }),
				}),
			)
			expect(result.manifestIcons).toEqual([
				{ src: "https://cdn.test/mark.svg", type: "image/svg+xml", sizes: "any" },
				{ src: "https://cdn.test/mask", type: "image/png", sizes: "512x512", purpose: "maskable" },
			])
		})

		test("drops non-square variants, keeping only square renditions", () => {
			const source: Media = {
				id: 1,
				name: "",
				alt: "",
				src: "https://cdn.test/full.png",
				mime: "image/png",
				width: 512,
				height: 512,
				variants: [
					{ src: "https://cdn.test/wide.png", width: 300, height: 150 },
					{ src: "https://cdn.test/192.png", width: 192, height: 192 },
				],
			}
			const result = resolveIcons(brand({ logo_icon: source }))
			expect(result.manifestIcons).toEqual([
				{ src: "https://cdn.test/full.png", type: "image/png", sizes: "512x512" },
				{ src: "https://cdn.test/192.png", type: "image/png", sizes: "192x192" },
			])
		})

		test("drops renditions below the 192px icon floor (e.g. the 150 thumbnail)", () => {
			const source: Media = {
				id: 1,
				name: "",
				alt: "",
				src: "https://cdn.test/full.png",
				mime: "image/png",
				width: 512,
				height: 512,
				variants: [{ src: "https://cdn.test/thumb.png", width: 150, height: 150 }],
			}
			const result = resolveIcons(brand({ logo_icon: source }))
			expect(result.manifestIcons).toEqual([{ src: "https://cdn.test/full.png", type: "image/png", sizes: "512x512" }])
		})

		test("keeps a non-square source verbatim when no square rendition qualifies", () => {
			const result = resolveIcons(brand({ logo_icon: media("image/png", "https://cdn.test/mark", { width: 180, height: 90 }) }))
			expect(result.manifestIcons[0]?.sizes).toBe("180x90")
		})

		test("falls back to sizes=any when the raster source lacks dimensions", () => {
			const result = resolveIcons(brand({ logo_icon: media("image/png", "https://cdn.test/mark") }))
			expect(result.manifestIcons).toEqual([{ src: "https://cdn.test/mark", type: "image/png", sizes: "any" }])
		})

		test("steps down to the favicon when logo_icon is a manifest-incompatible .ico", () => {
			const result = resolveIcons(
				brand({ logo_icon: media("image/x-icon"), favicon: media("image/jpeg", "https://cdn.test/fav", { width: 256, height: 256 }) }),
			)
			expect(result.manifestIcons).toEqual([{ src: "https://cdn.test/fav", type: "image/jpeg", sizes: "256x256" }])
		})

		test("emits nothing when only an .ico source exists", () => {
			const result = resolveIcons(brand({ logo_icon: media("image/x-icon") }))
			expect(result.manifestIcons).toEqual([])
		})
	})
})
