import { afterAll, beforeAll, expect, test } from "vitest"
import { getKizloTestInstance, getTestCredentials, type KizloTestInstance } from "../test/harness"
import { WordPressTransport } from "../wordpress"
import { WP_CORE_BASE } from "../wordpress/constants"
import { Comment, CommentList } from "./schema"

let kizlo: KizloTestInstance
let adminWp: WordPressTransport
let postId = 0
let rootId = 0
let replyId = 0
let otherPostId = 0
let otherCommentId = 0

const ROOT_BODY = "Comment test root"
const REPLY_BODY = "Comment test reply"
const OTHER_BODY = "Comment test elsewhere"

/** Approved on arrival, so the reads see them without depending on the moderation settings. */
async function seedComment(post: number, content: string, parent = 0): Promise<number> {
	const created = await adminWp.post<{ id: number }, string>("/comments", {
		base: WP_CORE_BASE,
		body: { post, content, parent, status: "approved", author_name: "Tester", author_email: "tester@example.test" },
	})
	if (created.error) throw created.error
	return created.data.id
}

beforeAll(async () => {
	kizlo = getKizloTestInstance()
	const creds = getTestCredentials()
	adminWp = new WordPressTransport({
		credentials: { url: creds.url, username: creds.users.admin.username, password: creds.users.admin.applicationPassword },
	})

	// Two posts, so the `post` filter has something to exclude rather than matching everything.
	for (const title of ["Comment Test Post", "Comment Test Other Post"]) {
		const post = await adminWp.post<{ id: number }, string>("/posts", {
			base: WP_CORE_BASE,
			body: { title, status: "publish", content: "Body." },
		})
		if (post.error) throw post.error
		if (postId) otherPostId = post.data.id
		else postId = post.data.id
	}

	rootId = await seedComment(postId, ROOT_BODY)
	replyId = await seedComment(postId, REPLY_BODY, rootId)
	otherCommentId = await seedComment(otherPostId, OTHER_BODY)
})

afterAll(async () => {
	for (const id of [replyId, rootId, otherCommentId]) {
		if (id) await adminWp.delete(`/comments/${id}`, { base: WP_CORE_BASE, searchParams: { force: true } })
	}
	for (const id of [postId, otherPostId]) {
		if (id) await adminWp.delete(`/posts/${id}`, { base: WP_CORE_BASE, searchParams: { force: true } })
	}
})

test("comments.get returns a comment conforming to Comment", async () => {
	const result = await kizlo.client.comments.get.call({ params: { id: rootId } })
	expect(Comment.safeParse(result).success).toBe(true)
	expect(result.id).toBe(rootId)
	expect(result.content).toContain(ROOT_BODY)
})

test("comments.get resolves the Kizlo enrichment block", async () => {
	const result = await kizlo.client.comments.get.call({ params: { id: rootId } })

	// `post` and `replyCount` come from the plugin's rest_prepare_comment filter, not from core.
	expect(result.post.id).toBe(postId)
	expect(result.post.title).toBe("Comment Test Post")
	expect(result.replyCount).toBe(1)
	expect(result.isApproved).toBe(true)
})

test("comments.get reports a missing comment rather than resolving", async () => {
	await expect(kizlo.client.comments.get.call({ params: { id: 99999999 } })).rejects.toThrow()
})

test("comments.list returns comments conforming to CommentList", async () => {
	const result = await kizlo.client.comments.list.call({ query: { post: [postId] } })
	expect(CommentList.safeParse(result).success).toBe(true)
	expect(result.items.length).toBeGreaterThanOrEqual(2)
})

test("comments.list is callable with no arguments when every input part is optional", async () => {
	const result = await kizlo.client.comments.list.call()
	expect(CommentList.safeParse(result).success).toBe(true)
})

test("comments.list filters by post, so another post's comments stay out", async () => {
	const result = await kizlo.client.comments.list.call({ query: { post: [postId], perPage: 100 } })
	const ids = result.items.map((item) => item.id)

	expect(ids).toContain(rootId)
	expect(ids).not.toContain(otherCommentId)
})

test("comments.list filters by parent, which is how a reply thread is read", async () => {
	const replies = await kizlo.client.comments.list.call({ query: { parent: [rootId] } })
	expect(replies.items.map((item) => item.id)).toEqual([replyId])
	expect(replies.items[0]?.parentId).toBe(rootId)
})

test("comments.list paginates, reading the totals off the response headers", async () => {
	const first = await kizlo.client.comments.list.call({ query: { post: [postId], perPage: 1, page: 1 } })

	expect(first.items).toHaveLength(1)
	expect(first.meta.page).toBe(1)
	expect(first.meta.totalItems).toBeGreaterThanOrEqual(2)
	expect(first.meta.totalPages).toBeGreaterThanOrEqual(2)
	expect(first.meta.hasNextPage).toBe(true)
	expect(first.meta.hasPrevPage).toBe(false)

	const second = await kizlo.client.comments.list.call({ query: { post: [postId], perPage: 1, page: 2 } })

	expect(second.meta.page).toBe(2)
	expect(second.meta.hasPrevPage).toBe(true)
	expect(second.items[0]?.id).not.toBe(first.items[0]?.id)
})

test("comments.list accepts a single filter value as well as a list", async () => {
	// The public input is arrayable; the route only takes lists, so the collapse has to happen.
	const result = await kizlo.client.comments.list.call({ query: { post: postId } })
	expect(result.items.map((item) => item.id)).toContain(rootId)
})
