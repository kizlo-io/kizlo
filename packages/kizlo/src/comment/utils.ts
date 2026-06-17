import type { Comment } from "./schema"
import type { WPK_Comment } from "./types"

export function deserializeComment(data: WPK_Comment): Comment {
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
			id: data.kizlo.post.id,
			image: data.kizlo.post.featured_image
				? {
						id: data.kizlo.post.featured_image.id,
						alt: data.kizlo.post.featured_image.alt,
						src: data.kizlo.post.featured_image.url,
						name: "",
					}
				: null,
			title: data.kizlo.post.title,
			slug: data.kizlo.post.slug,
		},
		postedAt: new Date(data.date).getTime(),
		replyCount: data.kizlo.reply_count,
	}
}
