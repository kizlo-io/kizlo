import { afterAll, beforeAll, expect, test } from "vitest"
import { getKizloTestInstance, getTestCredentials, type KizloTestInstance } from "../test"
import { WordPressService } from "../wordpress"
import { MenuGroupItemList, MenuItemList } from "./schema"

let kizlo: KizloTestInstance
let adminWp: WordPressService
let menuId = 0
let parentId = 0
let childId = 0
let draftId = 0

const PARENT_NAME = "Menu Test Parent"
const CHILD_NAME = "Menu Test Child"
const DRAFT_NAME = "Menu Test Draft"

beforeAll(async () => {
	kizlo = getKizloTestInstance()
	const creds = getTestCredentials()
	adminWp = new WordPressService({
		credentials: { url: creds.url, username: creds.users.admin.username, password: creds.users.admin.applicationPassword },
	})

	// The menu fixture seeds a `primary` menu; find it so we can attach edge-case items to it.
	const menus = await adminWp.menus.list({ per_page: 100 })
	if (menus.error) throw menus.error
	const primary = menus.data.items.find((menu) => menu.slug === "primary")
	if (!primary) throw new Error("primary menu fixture not found")
	menuId = primary.id

	// Provision a published parent + nested child to exercise the group nesting, and a draft to exercise status gating.
	const parent = await adminWp.menus.items.create({
		menus: menuId,
		title: PARENT_NAME,
		url: "/menu-test-parent",
		type: "custom",
		status: "publish",
	})
	if (parent.error) throw parent.error
	parentId = parent.data.id

	const child = await adminWp.menus.items.create({
		menus: menuId,
		title: CHILD_NAME,
		url: "/menu-test-child",
		type: "custom",
		status: "publish",
		parent: parentId,
	})
	if (child.error) throw child.error
	childId = child.data.id

	const draft = await adminWp.menus.items.create({
		menus: menuId,
		title: DRAFT_NAME,
		url: "/menu-test-draft",
		type: "custom",
		status: "draft",
	})
	if (draft.error) throw draft.error
	draftId = draft.data.id
})

afterAll(async () => {
	if (childId) await adminWp.menus.items.delete({ id: childId, force: true })
	if (parentId) await adminWp.menus.items.delete({ id: parentId, force: true })
	if (draftId) await adminWp.menus.items.delete({ id: draftId, force: true })
})

test("menus.items.list returns items conforming to MenuItemList", async () => {
	const result = await kizlo.client.menus.items.list.call({ query: {} })
	const parsed = MenuItemList.safeParse(result)
	expect(parsed.success).toBe(true)
	expect(result.items.length).toBeGreaterThanOrEqual(3)
})

test("menus.items.list is callable with no arguments when every input part is optional", async () => {
	const result = await kizlo.client.menus.items.list.call()
	const parsed = MenuItemList.safeParse(result)
	expect(parsed.success).toBe(true)
})

test("menus.items.list per_page=1 returns at most 1 item", async () => {
	const result = await kizlo.client.menus.items.list.call({ query: { perPage: 1 } })
	expect(result.items.length).toBeLessThanOrEqual(1)
})

test("menus.items.list filters by menu id", async () => {
	const match = await kizlo.client.menus.items.list.call({ query: { menus: [menuId] } })
	expect(match.items.length).toBeGreaterThanOrEqual(3)

	const none = await kizlo.client.menus.items.list.call({ query: { menus: [99999999] } })
	expect(none.items).toHaveLength(0)
})

test("menus.items.list excludes unpublished items", async () => {
	const result = await kizlo.client.menus.items.list.call({ query: {} })
	expect(result.items.some((item) => item.name === DRAFT_NAME)).toBe(false)
})

test("menus.items.list tolerates an invalid query instead of throwing", async () => {
	const result = await kizlo.client.menus.items.list.call({ query: { page: -3, perPage: 9999, orderby: "nope" } as never })
	const parsed = MenuItemList.safeParse(result)
	expect(parsed.success).toBe(true)
})

test("menus.items.groupList conforms to MenuGroupItemList and nests children under their parent", async () => {
	const result = await kizlo.client.menus.items.groupList.call({ query: {} })
	const parsed = MenuGroupItemList.safeParse(result)
	expect(parsed.success).toBe(true)

	const parent = result.items.find((item) => item.name === PARENT_NAME)
	expect(parent).toBeDefined()
	expect(parent?.hasItems).toBe(true)
	expect(parent?.items.map((child) => child.name)).toContain(CHILD_NAME)

	// A nested child must not surface as a root node.
	expect(result.items.some((item) => item.name === CHILD_NAME)).toBe(false)
})

test("menus.items.groupList excludes unpublished items", async () => {
	const result = await kizlo.client.menus.items.groupList.call({ query: {} })
	expect(result.items.some((item) => item.name === DRAFT_NAME)).toBe(false)
})
