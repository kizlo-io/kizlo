import { afterAll, beforeAll, expect, test } from "vitest"
import { getKizloTestInstance, getTestCredentials, type KizloTestInstance } from "../test"
import { WordPressService } from "../wordpress"
import { Category, CategoryList } from "./schema"

let kizlo: KizloTestInstance
let adminWp: WordPressService
let categoryId = 0
const CATEGORY_SLUG = "category-api-check"
const CATEGORY_NAME = "Category API Check"

beforeAll(async () => {
	kizlo = getKizloTestInstance()
	const creds = getTestCredentials()
	adminWp = new WordPressService({
		credentials: { url: creds.url, username: creds.users.admin.username, password: creds.users.admin.applicationPassword },
	})
	const created = await adminWp.categories.create({ slug: CATEGORY_SLUG, name: CATEGORY_NAME, description: "Seeded category." })
	if (created.error) throw created.error
	categoryId = created.data.id
})

afterAll(async () => {
	if (categoryId) await adminWp.categories.delete({ id: categoryId, force: true })
})

test("categories.list returns categories conforming to CategoryList", async () => {
	const result = await kizlo.client.categories.list.call({ query: {} })
	const parsed = CategoryList.safeParse(result)
	expect(parsed.success).toBe(true)
	expect(result.items.length).toBeGreaterThanOrEqual(1)
})

test("categories.list is callable with no arguments when every input part is optional", async () => {
	const result = await kizlo.client.categories.list.call()
	const parsed = CategoryList.safeParse(result)
	expect(parsed.success).toBe(true)
})

test("categories.list filters by slug", async () => {
	const match = await kizlo.client.categories.list.call({ query: { slug: [CATEGORY_SLUG] } })
	expect(match.items.map((c) => c.slug)).toEqual([CATEGORY_SLUG])
	const none = await kizlo.client.categories.list.call({ query: { slug: ["definitely-not-a-category"] } })
	expect(none.items).toHaveLength(0)
})

test("categories.get by slug returns the matching category with seo", async () => {
	const result = await kizlo.client.categories.get.call({ params: { identifier: CATEGORY_SLUG } })
	const parsed = Category.safeParse(result)
	expect(parsed.success).toBe(true)
	expect(result.slug).toBe(CATEGORY_SLUG)
	expect(result.seo).not.toBeNull()
})

test("categories.get by id returns the category with matching id", async () => {
	const result = await kizlo.client.categories.get.call({ params: { identifier: String(categoryId) } })
	expect(result.id).toBe(categoryId)
})

test("categories.get nonexistent id throws CATEGORY_NOT_FOUND", async () => {
	await expect(kizlo.client.categories.get.call({ params: { identifier: "999999" } })).rejects.toMatchObject({
		code: "CATEGORY_NOT_FOUND",
	})
})

test("categories.get by unknown slug throws CATEGORY_NOT_FOUND", async () => {
	await expect(kizlo.client.categories.get.call({ params: { identifier: "no-such-category-slug" } })).rejects.toMatchObject({
		code: "CATEGORY_NOT_FOUND",
	})
})
