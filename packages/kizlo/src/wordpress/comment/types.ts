import type { WP_Context, WP_Link, WP_ListOrder } from "../types"

// ====================================================
// SHARED
// ====================================================

/** State of the comment, as returned in responses. */
export type WP_CommentStatus = "approved" | "hold" | "spam" | "trash" | "unapproved"

/** Status filter values accepted by `GET /wp/v2/comments`. WP's list filter uses present-tense (`approve`, not `approved`) and adds an `all` alias. */
export type WP_CommentStatusFilter = "approve" | "hold" | "spam" | "trash" | "all"

/** Status values accepted by `POST /wp/v2/comments` and `POST /wp/v2/comments/<id>`. Same present-tense vocabulary as the filter, minus the `all` alias. */
export type WP_CommentStatusInput = "approve" | "hold" | "spam" | "trash"

/** Type of the comment. */
export type WP_CommentType = "comment" | "pingback" | "trackback"

/** Sort collection by comment attribute. */
export type WP_CommentOrderBy = "date" | "date_gmt" | "id" | "include" | "post" | "parent" | "type"

/** The content for the comment. */
export interface WP_CommentContent {
	/** HTML content for the comment, transformed for display. */
	rendered: string
	/** Content for the comment, as it exists in the database. */
	raw: string
}

/** Avatar URLs for the comment author, keyed by image size in pixels (e.g. "24", "48", "96"). */
export type WP_CommentAvatarUrls = Record<string, string>

/** Hypermedia links for the comment resource. */
export interface WP_CommentLinks {
	self?: WP_Link[]
	collection?: WP_Link[]
	up?: WP_Link[]
	"in-reply-to"?: WP_Link[]
	children?: WP_Link[]
	author?: WP_Link[]
	[rel: string]: WP_Link[] | undefined
}

// ====================================================
// COMMENT (response schema)
// ====================================================

export interface WP_Comment {
	/** Unique identifier for the comment. */
	id: number
	/** The ID of the user object, if author was a user. */
	author: number
	/** Email address for the comment author. */
	author_email: string
	/** IP address for the comment author. */
	author_ip: string
	/** Display name for the comment author. */
	author_name: string
	/** URL for the comment author. */
	author_url: string
	/** User agent for the comment author. */
	author_user_agent: string
	/** The content for the comment. */
	content: WP_CommentContent
	/** The date the comment was published, in the site's timezone. */
	date: string
	/** The date the comment was published, as GMT. */
	date_gmt: string
	/** URL to the comment. */
	link: string
	/** The ID for the parent of the comment. */
	parent: number
	/** The ID of the associated post object. */
	post: number
	/** State of the comment. */
	status: WP_CommentStatus
	/** Type of the comment. */
	type: WP_CommentType
	/** Avatar URLs for the comment author. */
	author_avatar_urls: WP_CommentAvatarUrls
	/** Meta fields. */
	meta: Record<string, unknown>
	/** Hypermedia links. */
	_links?: WP_CommentLinks
}

// ====================================================
// LIST — GET /wp/v2/comments
// ====================================================

export interface WP_CommentListInput {
	/** Scope under which the request is made; determines fields present in response. */
	context?: WP_Context
	/** Current page of the collection. */
	page?: number
	/** Maximum number of items to be returned in result set. */
	per_page?: number
	/** Limit results to those matching a string. */
	search?: string
	/** Limit response to comments published after a given ISO8601 compliant date. */
	after?: string
	/** Limit result set to comments assigned to specific user IDs. Requires authorization. */
	author?: number | number[]
	/** Ensure result set excludes comments assigned to specific user IDs. Requires authorization. */
	author_exclude?: number | number[]
	/** Limit result set to that from a specific author email. Requires authorization. */
	author_email?: string
	/** Limit response to comments published before a given ISO8601 compliant date. */
	before?: string
	/** Ensure result set excludes specific IDs. */
	exclude?: number | number[]
	/** Limit result set to specific IDs. */
	include?: number | number[]
	/** Offset the result set by a specific number of items. */
	offset?: number
	/** Order sort attribute ascending or descending. */
	order?: WP_ListOrder
	/** Sort collection by comment attribute. */
	orderby?: WP_CommentOrderBy
	/** Limit result set to comments of specific parent IDs. */
	parent?: number | number[]
	/** Ensure result set excludes specific parent IDs. */
	parent_exclude?: number | number[]
	/** Limit result set to comments assigned to specific post IDs. */
	post?: number | number[]
	/** Limit result set to comments assigned a specific status. Requires authorization. */
	status?: WP_CommentStatusFilter | WP_CommentStatusFilter[]
	/** Limit result set to comments assigned a specific type. Requires authorization. */
	type?: string
	/** The password for the post if it is password protected. */
	password?: string
}

export type WP_CommentListErrorCode =
	| "rest_cannot_read"
	| "rest_cannot_read_post"
	| "rest_forbidden_context"
	| "rest_forbidden_param"
	| "rest_comment_not_supported_post_type"

// ====================================================
// CREATE — POST /wp/v2/comments
// ====================================================

/** Content payload accepted when creating or updating a comment. */
export type WP_CommentContentInput = string | { raw: string }

export interface WP_CommentCreateInput {
	/** The ID of the user object, if author was a user. */
	author?: number
	/** Email address for the comment author. */
	author_email?: string
	/** IP address for the comment author. */
	author_ip?: string
	/** Display name for the comment author. */
	author_name?: string
	/** URL for the comment author. */
	author_url?: string
	/** User agent for the comment author. */
	author_user_agent?: string
	/** The content for the comment. */
	content?: WP_CommentContentInput
	/** The date the comment was published, in the site's timezone. */
	date?: string
	/** The date the comment was published, as GMT. */
	date_gmt?: string
	/** The ID for the parent of the comment. */
	parent?: number
	/** The ID of the associated post object. */
	post?: number
	/** State of the comment. */
	status?: WP_CommentStatusInput
	/** Meta fields. */
	meta?: Record<string, unknown>
}

export type WP_CommentCreateErrorCode =
	| "rest_comment_author_data_required"
	| "rest_comment_author_invalid"
	| "rest_comment_content_invalid"
	| "rest_comment_exists"
	| "rest_invalid_comment_type"
	| "rest_cannot_read_post"
	| "rest_comment_login_required"
	| "rest_cannot_create_note"
	| "rest_comment_closed"
	| "rest_comment_draft_post"
	| "rest_comment_invalid_author"
	| "rest_comment_invalid_author_ip"
	| "rest_comment_invalid_post_id"
	| "rest_comment_invalid_status"
	| "rest_comment_not_supported_post_type"
	| "rest_comment_trash_post"
	| "rest_comment_failed_create"

// ====================================================
// RETRIEVE — GET /wp/v2/comments/<id>
// ====================================================

export interface WP_CommentRetrieveInput {
	/** Unique identifier for the comment. */
	id: number
	/** Scope under which the request is made; determines fields present in response. */
	context?: WP_Context
	/** The password for the parent post of the comment (if the post is password protected). */
	password?: string | undefined
}

export type WP_CommentRetrieveErrorCode =
	| "rest_cannot_read"
	| "rest_cannot_read_post"
	| "rest_forbidden_context"
	| "rest_comment_invalid_id"
	| "rest_post_invalid_id"

// ====================================================
// UPDATE — POST /wp/v2/comments/<id>
// ====================================================

export interface WP_CommentUpdateInput {
	/** Unique identifier for the comment. */
	id: number
	/** The ID of the user object, if author was a user. */
	author?: number
	/** Email address for the comment author. */
	author_email?: string
	/** IP address for the comment author. */
	author_ip?: string
	/** Display name for the comment author. */
	author_name?: string
	/** URL for the comment author. */
	author_url?: string
	/** User agent for the comment author. */
	author_user_agent?: string
	/** The content for the comment. */
	content?: WP_CommentContentInput
	/** The date the comment was published, in the site's timezone. */
	date?: string
	/** The date the comment was published, as GMT. */
	date_gmt?: string
	/** The ID for the parent of the comment. */
	parent?: number
	/** The ID of the associated post object. */
	post?: number
	/** State of the comment. */
	status?: WP_CommentStatusInput
	/** Meta fields. */
	meta?: Record<string, unknown>
}

export type WP_CommentUpdateErrorCode =
	| "rest_comment_author_invalid"
	| "rest_comment_content_invalid"
	| "rest_cannot_edit"
	| "rest_comment_invalid_post_id"
	| "rest_comment_invalid_id"
	| "rest_comment_invalid_type"
	| "rest_post_invalid_id"
	| "rest_comment_failed_edit"

// ====================================================
// DELETE — DELETE /wp/v2/comments/<id>
// ====================================================

export interface WP_CommentDeleteInput {
	/** Unique identifier for the comment. */
	id: number
	/** Whether to bypass Trash and force deletion. */
	force?: boolean
	/** The password for the parent post of the comment (if the post is password protected). */
	password?: string
}

/**
 * Response from `DELETE /wp/v2/comments/<id>`.
 * - When `force=true`: returns `{ deleted: true, previous: WP_Comment }`.
 * - When `force=false` (trashed): returns the updated `WP_Comment` with `status: "trash"`.
 */
export type WP_CommentDeleteResponse = WP_Comment | { deleted: true; previous: WP_Comment }

export type WP_CommentDeleteErrorCode =
	| "rest_cannot_delete"
	| "rest_comment_invalid_id"
	| "rest_post_invalid_id"
	| "rest_already_trashed"
	| "rest_trash_not_supported"
