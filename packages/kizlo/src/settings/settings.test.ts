import { afterAll, beforeAll, expect, test } from "vitest"
import { getKizloTestInstance, type KizloTestInstance } from "../test"
import type { Settings } from "./service.interface"

let kizlo: KizloTestInstance
let original: Settings

beforeAll(async () => {
	kizlo = getKizloTestInstance()
	// Snapshot the live settings so every mutating test can restore what it changed.
	original = await kizlo.client.settings.get.call()
})

afterAll(async () => {
	// Restore the two sections the round-trip tests touch, leaving the stack as found.
	await kizlo.client.settings.site.update.call({ tagline: original.site.tagline })

	const post = original.post_types.find((type) => type.slug === "post")
	if (post) {
		await kizlo.client.settings.postType.update.call({
			key: "post",
			data: { title_structure: post.title_structure },
		})
	}
})

test("settings.get returns every section of the Settings contract", async () => {
	const settings = await kizlo.client.settings.get.call()

	expect(settings.site).toBeTypeOf("object")
	expect(settings.brand).toBeTypeOf("object")
	expect(settings.identity).toBeTypeOf("object")
	expect(settings.authors).toBeTypeOf("object")
	expect(settings.crawling.robots).toBeTypeOf("object")
	expect(settings.webhook).toBeTypeOf("object")
	expect(settings.uploads).toBeTypeOf("object")
	expect(Array.isArray(settings.post_types)).toBe(true)
	expect(Array.isArray(settings.taxonomies)).toBe(true)
	expect(Array.isArray(settings.statuses)).toBe(true)
	expect(settings.plain_permalinks).toBeTypeOf("boolean")
})

test("settings.get no longer exposes publicly_queryable on post types or taxonomies", async () => {
	const settings = await kizlo.client.settings.get.call()

	for (const type of settings.post_types) expect(type).not.toHaveProperty("publicly_queryable")
	for (const taxonomy of settings.taxonomies) expect(taxonomy).not.toHaveProperty("publicly_queryable")
})

test("settings.site.update echoes the saved section and persists it", async () => {
	const tagline = `Kizlo settings test ${Date.now()}`

	const updated = await kizlo.client.settings.site.update.call({ tagline })
	expect(updated.tagline).toBe(tagline)

	const refetched = await kizlo.client.settings.get.call()
	expect(refetched.site.tagline).toBe(tagline)
})

test("settings.postType.update returns the single updated post type", async () => {
	const title_structure = `%%title%% test ${Date.now()}`

	const updated = await kizlo.client.settings.postType.update.call({
		key: "post",
		data: { title_structure },
	})

	expect(updated.slug).toBe("post")
	expect(updated.title_structure).toBe(title_structure)

	const refetched = await kizlo.client.settings.get.call()
	expect(refetched.post_types.find((type) => type.slug === "post")?.title_structure).toBe(title_structure)
})
