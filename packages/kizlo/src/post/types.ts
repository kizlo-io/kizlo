import type { WPK_Seo } from "../seo/types"
import type { WP_Post } from "../wordpress"

export interface WPK_Post extends WP_Post {
	kizlo: {
		seo?: WPK_Seo
		categories: {
			id: number
			name: string
			slug: string
		}[]
		tags: {
			id: number
			name: string
			slug: string
		}[]
		author: {
			id: number
			name: string
			slug: string
			avatar_url?: string
		}
		featured_media?: {
			id: number
			url: string
			alt: string
		} | null
	}
}
