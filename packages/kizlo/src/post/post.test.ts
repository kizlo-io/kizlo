import { beforeAll, expect, test } from "vitest"
import { getKizloTestInstance, type KizloTestInstance } from "../test"
import { Post, PostList } from "./schema"

let kizlo: KizloTestInstance

beforeAll(() => {
	kizlo = getKizloTestInstance()
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
