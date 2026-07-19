import { afterAll, beforeAll, expect, test } from "vitest"
import { getKizloTestInstance, getTestCredentials, type KizloTestInstance } from "../test"
import { WordPressService } from "../wordpress"
import { Tag, TagList } from "./schema"

let kizlo: KizloTestInstance
let adminWp: WordPressService
let tagId = 0
let bareTagId = 0
const TAG_SLUG = "tag-api-check"
const TAG_NAME = "Tag API Check"
// A tag with no description, so the empty-description -> null reshape is exercised.
const BARE_SLUG = "tag-api-bare"

beforeAll(async () => {
	kizlo = getKizloTestInstance()
	const creds = getTestCredentials()
	adminWp = new WordPressService({
		credentials: { url: creds.url, username: creds.users.admin.username, password: creds.users.admin.applicationPassword },
	})
	const created = await adminWp.tags.create({ slug: TAG_SLUG, name: TAG_NAME, description: "Seeded tag." })
	if (created.error) throw created.error
	tagId = created.data.id

	const bare = await adminWp.tags.create({ slug: BARE_SLUG, name: "Tag API Bare" })
	if (bare.error) throw bare.error
	bareTagId = bare.data.id
})

afterAll(async () => {
	if (tagId) await adminWp.tags.delete({ id: tagId, force: true })
	if (bareTagId) await adminWp.tags.delete({ id: bareTagId, force: true })
})

test("tags.list returns tags conforming to TagList", async () => {
	const result = await kizlo.client.tags.list.call({ query: {} })
	const parsed = TagList.safeParse(result)
	expect(parsed.success).toBe(true)
	expect(result.items.length).toBeGreaterThanOrEqual(1)
})

test("tags.list is callable with no arguments when every input part is optional", async () => {
	const result = await kizlo.client.tags.list.call()
	const parsed = TagList.safeParse(result)
	expect(parsed.success).toBe(true)
})

test("tags.list filters by slug", async () => {
	const match = await kizlo.client.tags.list.call({ query: { slug: [TAG_SLUG] } })
	expect(match.items.map((t) => t.slug)).toEqual([TAG_SLUG])
	const none = await kizlo.client.tags.list.call({ query: { slug: ["definitely-not-a-tag"] } })
	expect(none.items).toHaveLength(0)
})

test("tags.list filters by include (numeric camelCase -> snake_case mapping applies)", async () => {
	const result = await kizlo.client.tags.list.call({ query: { include: [tagId] } })
	expect(result.items.map((t) => t.id)).toEqual([tagId])
})

test("tags.list filters by exclude", async () => {
	const result = await kizlo.client.tags.list.call({ query: { slug: [TAG_SLUG, BARE_SLUG], exclude: [tagId] } })
	expect(result.items.map((t) => t.slug)).toEqual([BARE_SLUG])
})

test("tags.get by slug returns the matching tag with seo", async () => {
	const result = await kizlo.client.tags.get.call({ params: { identifier: TAG_SLUG } })
	const parsed = Tag.safeParse(result)
	expect(parsed.success).toBe(true)
	expect(result.slug).toBe(TAG_SLUG)
	expect(result.seo).not.toBeNull()
})

test("tags.get returns exactly the kizlo shape with no leaked WordPress or parent fields", async () => {
	const result = await kizlo.client.tags.get.call({ params: { identifier: TAG_SLUG } })
	// deserializeTag builds the object explicitly; assert the surface is exactly these keys.
	expect(Object.keys(result).sort()).toEqual(["description", "id", "meta", "name", "postCount", "seo", "slug", "url"])
	// post_tag is non-hierarchical: parent must never appear.
	expect("parent" in result).toBe(false)
})

test("tags.get reshapes the WordPress term into the kizlo shape", async () => {
	const result = await kizlo.client.tags.get.call({ params: { identifier: TAG_SLUG } })
	// url comes from the plugin's term-url resolver, not the raw WP link.
	expect(result.url).toBe(`${getTestCredentials().url}/tag/${TAG_SLUG}/`)
	expect(result.description).toBe("Seeded tag.")
	expect(typeof result.postCount).toBe("number")
})

test("tags.get nulls an empty description instead of returning an empty string", async () => {
	const result = await kizlo.client.tags.get.call({ params: { identifier: BARE_SLUG } })
	expect(result.description).toBeNull()
	expect(result.url).toBe(`${getTestCredentials().url}/tag/${BARE_SLUG}/`)
})

test("tags.list exposes a resolved url on every item and null seo (enrichment only on single fetch)", async () => {
	const result = await kizlo.client.tags.list.call({ query: { slug: [TAG_SLUG] } })
	expect(result.items[0]?.url).toBe(`${getTestCredentials().url}/tag/${TAG_SLUG}/`)
	expect(result.items[0]?.seo).toBeNull()
})

test("tags.get by id returns the tag with matching id", async () => {
	const result = await kizlo.client.tags.get.call({ params: { identifier: String(tagId) } })
	expect(result.id).toBe(tagId)
})

test("tags.get nonexistent id throws TAG_NOT_FOUND", async () => {
	await expect(kizlo.client.tags.get.call({ params: { identifier: "999999" } })).rejects.toMatchObject({
		code: "TAG_NOT_FOUND",
	})
})

test("tags.get by unknown slug throws TAG_NOT_FOUND", async () => {
	await expect(kizlo.client.tags.get.call({ params: { identifier: "no-such-tag-slug" } })).rejects.toMatchObject({
		code: "TAG_NOT_FOUND",
	})
})
