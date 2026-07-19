import { afterAll, beforeAll, expect, test } from "vitest"
import { getKizloTestInstance, getTestCredentials, type KizloTestInstance } from "../test"
import { WordPressService } from "../wordpress"
import { Post, PostList } from "./schema"

let kizlo: KizloTestInstance
let adminWp: WordPressService
let draftId = 0
const DRAFT_SLUG = "draft-gating-check"

beforeAll(async () => {
	kizlo = getKizloTestInstance()
	const creds = getTestCredentials()
	adminWp = new WordPressService({
		credentials: { url: creds.url, username: creds.users.admin.username, password: creds.users.admin.applicationPassword },
	})
	// Provision an unpublished post to exercise draft gating and list exclusion, then clean it up.
	const created = await adminWp.posts.create({
		slug: DRAFT_SLUG,
		title: "Draft Gating Check",
		content: "Unpublished.",
		status: "draft",
		author: creds.users.admin.id,
	})
	if (created.error) throw created.error
	draftId = created.data.id
})

afterAll(async () => {
	if (draftId) await adminWp.posts.delete({ id: draftId, force: true })
})

test("posts.list returns posts conforming to PostList", async () => {
	const result = await kizlo.client.posts.list.call({ query: {} })
	const parsed = PostList.safeParse(result)
	expect(parsed.success).toBe(true)
	expect(result.items.length).toBeGreaterThanOrEqual(2)
})

test("posts.list is callable with no arguments when every input part is optional", async () => {
	const result = await kizlo.client.posts.list.call()
	const parsed = PostList.safeParse(result)
	expect(parsed.success).toBe(true)
	expect(result.items.length).toBeGreaterThanOrEqual(2)
})

test("posts.list per_page=1 returns at most 1 item", async () => {
	const result = await kizlo.client.posts.list.call({ query: { perPage: 1 } })
	expect(result.items.length).toBeLessThanOrEqual(1)
})

test("posts.list filters by slug", async () => {
	const match = await kizlo.client.posts.list.call({ query: { slug: ["hello-world-test"] } })
	expect(match.items.map((p) => p.slug)).toEqual(["hello-world-test"])
	const none = await kizlo.client.posts.list.call({ query: { slug: ["definitely-not-a-slug"] } })
	expect(none.items).toHaveLength(0)
})

test("posts.get by slug returns the matching post", async () => {
	const result = await kizlo.client.posts.get.call({ params: { identifier: "hello-world-test" } })
	const parsed = Post.safeParse(result)
	expect(parsed.success).toBe(true)
	expect(result.slug).toBe("hello-world-test")
})

test("posts.get by id returns the post with matching id", async () => {
	const list = await kizlo.client.posts.list.call({ query: { slug: ["hello-world-test"] } })
	const seedId = list.items[0]?.id
	if (!seedId) throw new Error("seed post not found")
	const result = await kizlo.client.posts.get.call({ params: { identifier: String(seedId) } })
	expect(result.id).toBe(seedId)
})

test("posts.get nonexistent throws POST_NOT_FOUND", async () => {
	await expect(kizlo.client.posts.get.call({ params: { identifier: "999999" } })).rejects.toMatchObject({ code: "POST_NOT_FOUND" })
})

test("posts.get by unknown slug throws POST_NOT_FOUND", async () => {
	await expect(kizlo.client.posts.get.call({ params: { identifier: "no-such-post-slug" } })).rejects.toMatchObject({
		code: "POST_NOT_FOUND",
	})
})

test("posts.get of a draft without a preview token throws POST_NOT_FOUND", async () => {
	await expect(kizlo.client.posts.get.call({ params: { identifier: String(draftId) } })).rejects.toMatchObject({
		code: "POST_NOT_FOUND",
	})
})

test("posts.list excludes unpublished posts", async () => {
	const result = await kizlo.client.posts.list.call({ query: {} })
	expect(result.items.some((p) => p.slug === DRAFT_SLUG)).toBe(false)
})
