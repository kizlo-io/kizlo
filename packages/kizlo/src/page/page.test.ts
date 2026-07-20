import { afterAll, beforeAll, expect, test } from "vitest"
import { getKizloTestInstance, getTestCredentials, type KizloTestInstance } from "../test"
import { WordPressService } from "../wordpress"
import { Page, PageList } from "./schema"

let kizlo: KizloTestInstance
let adminWp: WordPressService
let publishedId = 0
let draftId = 0
const PUBLISHED_SLUG = "about-test-page"
const DRAFT_SLUG = "draft-page-gating-check"

beforeAll(async () => {
	kizlo = getKizloTestInstance()
	const creds = getTestCredentials()
	adminWp = new WordPressService({
		credentials: { url: creds.url, username: creds.users.admin.username, password: creds.users.admin.applicationPassword },
	})

	// Self-provision a published page to read, plus an unpublished one to exercise draft gating and list exclusion.
	const published = await adminWp.pages.create({
		slug: PUBLISHED_SLUG,
		title: "About Test Page",
		content: "First seeded page.",
		status: "publish",
		author: creds.users.admin.id,
	})
	if (published.error) throw published.error
	publishedId = published.data.id

	const draft = await adminWp.pages.create({
		slug: DRAFT_SLUG,
		title: "Draft Page Gating Check",
		content: "Unpublished.",
		status: "draft",
		author: creds.users.admin.id,
	})
	if (draft.error) throw draft.error
	draftId = draft.data.id
})

afterAll(async () => {
	if (publishedId) await adminWp.pages.delete({ id: publishedId, force: true })
	if (draftId) await adminWp.pages.delete({ id: draftId, force: true })
})

test("pages.list returns pages conforming to PageList", async () => {
	const result = await kizlo.client.pages.list.call({ query: {} })
	const parsed = PageList.safeParse(result)
	expect(parsed.success).toBe(true)
	expect(result.items.length).toBeGreaterThanOrEqual(1)
})

test("pages.list is callable with no arguments when every input part is optional", async () => {
	const result = await kizlo.client.pages.list.call()
	const parsed = PageList.safeParse(result)
	expect(parsed.success).toBe(true)
})

test("pages.list per_page=1 returns at most 1 item", async () => {
	const result = await kizlo.client.pages.list.call({ query: { perPage: 1 } })
	expect(result.items.length).toBeLessThanOrEqual(1)
})

test("pages.list filters by slug", async () => {
	const match = await kizlo.client.pages.list.call({ query: { slug: [PUBLISHED_SLUG] } })
	expect(match.items.map((p) => p.slug)).toEqual([PUBLISHED_SLUG])
	const none = await kizlo.client.pages.list.call({ query: { slug: ["definitely-not-a-page-slug"] } })
	expect(none.items).toHaveLength(0)
})

test("pages.get by slug returns the matching page", async () => {
	const result = await kizlo.client.pages.get.call({ params: { identifier: PUBLISHED_SLUG } })
	const parsed = Page.safeParse(result)
	expect(parsed.success).toBe(true)
	expect(result.slug).toBe(PUBLISHED_SLUG)
})

test("pages.get by id returns the page with matching id", async () => {
	const result = await kizlo.client.pages.get.call({ params: { identifier: String(publishedId) } })
	expect(result.id).toBe(publishedId)
})

test("pages.get nonexistent throws PAGE_NOT_FOUND", async () => {
	await expect(kizlo.client.pages.get.call({ params: { identifier: "999999" } })).rejects.toMatchObject({ code: "PAGE_NOT_FOUND" })
})

test("pages.get by unknown slug throws PAGE_NOT_FOUND", async () => {
	await expect(kizlo.client.pages.get.call({ params: { identifier: "no-such-page-slug" } })).rejects.toMatchObject({
		code: "PAGE_NOT_FOUND",
	})
})

test("pages.get of a draft without a preview token throws PAGE_NOT_FOUND", async () => {
	await expect(kizlo.client.pages.get.call({ params: { identifier: String(draftId) } })).rejects.toMatchObject({
		code: "PAGE_NOT_FOUND",
	})
})

test("pages.list excludes unpublished pages", async () => {
	const result = await kizlo.client.pages.list.call({ query: {} })
	expect(result.items.some((p) => p.slug === DRAFT_SLUG)).toBe(false)
})
