import type { WPK_Seo } from "../seo/types"
import type { Identifier } from "../shared/identifier"
import type {
	WP_PostCommentStatus,
	WP_PostCreateErrorCode,
	WP_PostDeleteErrorCode,
	WP_PostFormat,
	WP_PostListErrorCode,
	WP_PostRetrieveErrorCode,
	WP_PostStatus,
	WP_PostUpdateErrorCode,
} from "../wordpress"

/** A resolved taxonomy term attached to an enriched post. */
export interface WPK_TermRef {
	id: number
	name: string
	slug: string
}

/**
 * The `kizlo` enrichment block injected by the plugin's post-type controller.
 * Every field is optional: the PHP layer omits `categories`/`tags`/`author`/
 * `featured_media` when the post has none, and `seo` is only present on single
 * fetches (never on list items).
 */
export interface WPK_PostEnrichment {
	seo?: WPK_Seo
	categories?: WPK_TermRef[]
	tags?: WPK_TermRef[]
	author?: {
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

/**
 * Error codes returned by the custom `kizlo/v1/post-types` routes. These widen
 * the underlying WP core post error codes with the plugin's own guards:
 * `invalid_post_type` (unknown post type) and `post_type_not_found` (unresolved
 * slug identifier).
 */
export type WPK_PostTypeListErrorCode = WP_PostListErrorCode | "invalid_post_type"
export type WPK_PostTypeRetrieveErrorCode = WP_PostRetrieveErrorCode | "invalid_post_type" | "post_type_not_found"
export type WPK_PostTypeCreateErrorCode = WP_PostCreateErrorCode | "invalid_post_type"
export type WPK_PostTypeUpdateErrorCode = WP_PostUpdateErrorCode | "invalid_post_type" | "post_type_not_found"
export type WPK_PostTypeDeleteErrorCode = WP_PostDeleteErrorCode | "invalid_post_type" | "post_type_not_found"

export interface WPK_PostType {
	/** Unique identifier for the post. */
	id: number

	/** The globally unique identifier for the post. */
	guid: { rendered: string }

	/** URL to the post. */
	link: string

	/** The date the post was last modified, in the site's timezone. */
	modified: string

	/** The date the post was last modified, as GMT. */
	modified_gmt: string

	/** Type of post. */
	type: string

	/** Permalink template for the post. Available in edit context only. */
	permalink_template?: string

	/** Slug automatically generated from the post title. Available in edit context only. */
	generated_slug?: string

	/** The date the post was published, in the site's timezone. */
	date: string

	/** The date the post was published, as GMT. */
	date_gmt: string | null

	/** An alphanumeric identifier for the post unique to its type. */
	slug: string

	/** A named status for the post. */
	status: WP_PostStatus

	/** A password to protect access to the content and excerpt. Available in edit context only. */
	password?: string

	/** The title for the post. */
	title?: { rendered: string }

	/** The content for the post. */
	content?: { rendered: string; protected: boolean }

	/** The ID for the author of the post. */
	author?: number

	/** The excerpt for the post. */
	excerpt?: { rendered: string; protected: boolean }

	/** The ID of the featured media for the post. */
	featured_media?: number

	/** Whether or not comments are open on the post. */
	comment_status?: WP_PostCommentStatus

	/** Whether or not the post can be pinged. */
	ping_status?: WP_PostCommentStatus

	/** The format for the post. */
	format?: WP_PostFormat

	/** Meta fields. */
	meta?: Record<string, string>

	/** Whether or not the post should be treated as sticky. */
	sticky?: boolean

	/** The theme file to use to display the post. */
	template?: string

	/** The terms assigned to the post in the category taxonomy. */
	categories?: number[]

	/** The terms assigned to the post in the post_tag taxonomy. */
	tags?: number[]

	kizlo?: WPK_PostEnrichment
}

export interface WPK_CreatePostTypeInput {
	title?: string
	slug?: string
	date?: string
	content?: string
	excerpt?: string
	status?: WP_PostStatus
	author?: number
	featured_media?: number
	comment_status?: WP_PostCommentStatus
	format?: WP_PostFormat
	meta?: Record<string, string>
	categories?: number[]
	tags?: number[]
	password?: string
}

export interface WPK_UpdatePostTypeInput extends WPK_CreatePostTypeInput {
	identifier: Identifier
}

export interface WPK_DeletePostTypeInput {
	identifier: Identifier
	force?: boolean
}
