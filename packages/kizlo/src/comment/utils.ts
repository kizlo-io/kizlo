import type { Comment } from "./schema"
import type { WPK_Comment } from "./types"

/**
 * Map a WordPress comment onto the public shape. Returns `null` when the commented post is gone —
 * the contract types it nullable, and a comment with no post has nothing to point a reader at.
 */
export function deserializeComment(data: WPK_Comment): Comment | null {
	const post = data.kizlo.post
	if (!post) return null

	return {
		id: data.id,
		author: data.kizlo.author
			? {
					id: data.kizlo.author.id,
					avatar: data.kizlo.author.avatar_url
						? {
								id: 0,
								alt: "",
								name: "",
								src: data.kizlo.author.avatar_url,
							}
						: null,
					name: data.kizlo.author.name,
				}
			: null,
		content: data.content.rendered,
		isApproved: data.status === "approved",
		parentId: data.parent,
		post: {
			id: post.id,
			image: post.featured_image?.url
				? {
						id: post.featured_image.id,
						alt: post.featured_image.alt,
						src: post.featured_image.url,
						name: "",
					}
				: null,
			title: post.title,
			slug: post.slug,
		},
		postedAt: new Date(data.date).getTime(),
		replyCount: data.kizlo.reply_count,
	}
}
