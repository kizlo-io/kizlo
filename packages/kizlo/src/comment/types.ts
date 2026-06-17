import type { WP_Comment } from "../wordpress"

export interface WPK_Comment extends WP_Comment {
	kizlo: {
		author: {
			id: number
			name: string
			slug: string
			avatar_url?: string
		} | null
		post: {
			id: number
			slug: string
			title: string
			featured_image: {
				id: number
				url: string
				alt: string
			} | null
		}
		reply_count: number
	}
}

export interface WPK_CreateCommentInput {
	post_id: number
	content: string
	parent?: number
	user_id?: number
	author_name?: string
	author_email?: string
	author_url?: string
	author_ip: string
	user_agent: string
}
