import { defineFixture, type SeedContext } from "../cli/wp/types"

interface SeedPost {
	slug: string
	title: string
	content: string
	comments?: Array<{ author: string; email: string; content: string }>
}

const POSTS: SeedPost[] = [
	{
		slug: "hello-world-test",
		title: "Hello World Test",
		content: "First seeded post.",
		comments: [{ author: "customer", email: "customer@example.com", content: "Seed comment" }],
	},
	{ slug: "second-test-post", title: "Second Test Post", content: "Second seeded post." },
]

async function upsertPost(ctx: SeedContext, post: SeedPost): Promise<number> {
	const existing = await ctx.service.posts.list({ slug: post.slug, per_page: 1 })
	if (existing.error) throw existing.error
	if (existing.data.items[0]) return existing.data.items[0].id

	const created = await ctx.service.posts.create({
		slug: post.slug,
		title: post.title,
		content: post.content,
		status: "publish",
		author: ctx.adminId,
	})
	if (created.error) throw created.error
	return created.data.id
}

async function seedComments(ctx: SeedContext, postId: number, comments: SeedPost["comments"]): Promise<void> {
	if (!comments?.length) return
	const existing = await ctx.service.comments.list({ post: postId, per_page: 1 })
	if (existing.error) throw existing.error
	if (existing.data.items.length > 0) return

	for (const comment of comments) {
		const created = await ctx.service.comments.create({
			post: postId,
			content: comment.content,
			author_name: comment.author,
			author_email: comment.email,
			status: "approve",
		})
		if (created.error) throw created.error
	}
}

/** Core post fixture: seeds sample posts + comments so the post/comment suites have content to read. */
export function postFixture() {
	return defineFixture({
		name: "post",
		async seed(ctx) {
			let postId = 0
			for (const post of POSTS) {
				const id = await upsertPost(ctx, post)
				if (!postId) postId = id
				await seedComments(ctx, id, post.comments)
			}
			return { postId }
		},
	})
}
