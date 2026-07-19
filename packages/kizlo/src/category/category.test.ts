import { afterAll, beforeAll, expect, test } from "vitest"
import { getKizloTestInstance, getTestCredentials, type KizloTestInstance } from "../test"
import { WordPressService } from "../wordpress"
import { Category, CategoryList } from "./schema"

let kizlo: KizloTestInstance
let adminWp: WordPressService
let categoryId = 0
let childId = 0
const CATEGORY_SLUG = "category-api-check"
const CATEGORY_NAME = "Category API Check"
const CHILD_SLUG = "category-api-child"

beforeAll(async () => {
	kizlo = getKizloTestInstance()
	const creds = getTestCredentials()
	adminWp = new WordPressService({
		credentials: { url: creds.url, username: creds.users.admin.username, password: creds.users.admin.applicationPassword },
	})
	// A top-level category plus a child, so the parent reshape (0 -> null vs a real id) and the parent filter are exercised.
	const created = await adminWp.categories.create({ slug: CATEGORY_SLUG, name: CATEGORY_NAME, description: "Seeded category." })
	if (created.error) throw created.error
	categoryId = created.data.id

	const child = await adminWp.categories.create({ slug: CHILD_SLUG, name: "Category API Child", parent: categoryId })
	if (child.error) throw child.error
	childId = child.data.id
})

afterAll(async () => {
	if (childId) await adminWp.categories.delete({ id: childId, force: true })
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

test("categories.get reshapes the WordPress term into the kizlo shape", async () => {
	const result = await kizlo.client.categories.get.call({ params: { identifier: CATEGORY_SLUG } })
	// url comes from the plugin's term-url resolver, not the raw WP link.
	expect(result.url).toBe(`${getTestCredentials().url}/category/${CATEGORY_SLUG}/`)
	expect(result.description).toBe("Seeded category.")
	expect(result.parent).toBeNull()
	expect(typeof result.postCount).toBe("number")
})

test("categories.get on a child exposes its parent id", async () => {
	const result = await kizlo.client.categories.get.call({ params: { identifier: CHILD_SLUG } })
	expect(result.parent).toBe(categoryId)
	expect(result.url).toBeTruthy()
})

test("categories.list filters by parent", async () => {
	const result = await kizlo.client.categories.list.call({ query: { parent: categoryId } })
	expect(result.items.map((c) => c.slug)).toEqual([CHILD_SLUG])
})

test("categories.list exposes a resolved url on every item", async () => {
	const result = await kizlo.client.categories.list.call({ query: { slug: [CATEGORY_SLUG] } })
	expect(result.items[0]?.url).toBe(`${getTestCredentials().url}/category/${CATEGORY_SLUG}/`)
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
