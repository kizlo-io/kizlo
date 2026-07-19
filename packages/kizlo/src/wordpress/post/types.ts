// ====================================================
// SHARED
// ====================================================

import type { WP_Context, WP_Link, WP_ListOrder } from "../types"

/** A named status for the post. Used in responses and as the input on create/update. */
export const WP_POST_STATUSES = ["publish", "future", "draft", "pending", "private", "trash"] as const
export type WP_PostStatus = (typeof WP_POST_STATUSES)[number]

/** Status filter values accepted by `GET /wp/v2/posts`. Widens `WP_PostStatus` with WP-internal statuses and the `any` alias. */
export type WP_PostStatusFilter = WP_PostStatus | "auto-draft" | "inherit" | "any"

/** Whether or not comments / pings are open on the post. */
export type WP_PostCommentStatus = "open" | "closed"

/** The format for the post. */
export const WP_POST_FORMATS = ["standard", "aside", "chat", "gallery", "link", "image", "quote", "status", "video", "audio"] as const
export type WP_PostFormat = (typeof WP_POST_FORMATS)[number]

/** Sort collection by post attribute. */
export const WP_POST_ORDER_BYES = [
	"author",
	"date",
	"id",
	"include",
	"modified",
	"parent",
	"relevance",
	"slug",
	"include_slugs",
	"title",
] as const
export type WP_PostOrderBy = (typeof WP_POST_ORDER_BYES)[number]

/** Limit result set based on relationship between multiple taxonomies. */
export const WP_POST_TAX_RELATIONS = ["AND", "OR"] as const
export type WP_PostTaxRelation = (typeof WP_POST_TAX_RELATIONS)[number]

/** The globally unique identifier for the post. */
export interface WP_PostGuid {
	/** GUID for the post, transformed for display. */
	rendered: string
	/** GUID for the post, as it exists in the database. */
	raw: string
}

/** The title for the post. */
export interface WP_PostTitle {
	/** HTML title for the post, transformed for display. */
	rendered: string
	/** Title for the post, as it exists in the database. */
	raw: string
}

/** The content for the post. */
export interface WP_PostContent {
	/** HTML content for the post, transformed for display. */
	rendered: string
	/** Content for the post, as it exists in the database. */
	raw: string
	/** Version of the block format used in the post. */
	block_version: number
	/** Whether the content is protected with a password. */
	protected: boolean
}

/** The excerpt for the post. */
export interface WP_PostExcerpt {
	/** HTML excerpt for the post, transformed for display. */
	rendered: string
	/** Excerpt for the post, as it exists in the database. */
	raw: string
	/** Whether the excerpt is protected with a password. */
	protected: boolean
}

/** Hypermedia links for the post resource. */
export interface WP_PostLinks {
	self?: WP_Link[]
	collection?: WP_Link[]
	about?: WP_Link[]
	author?: WP_Link[]
	replies?: WP_Link[]
	"version-history"?: WP_Link[]
	"predecessor-version"?: WP_Link[]
	"wp:featuredmedia"?: WP_Link[]
	"wp:attachment"?: WP_Link[]
	"wp:term"?: WP_Link[]
	curies?: WP_Link[]
	[rel: string]: WP_Link[] | undefined
}

// ====================================================
// POST (response schema)
// ====================================================

export interface WP_Post {
	/** Unique identifier for the post. */
	id: number
	/** The date the post was published, in the site's timezone. */
	date: string | null
	/** The date the post was published, as GMT. */
	date_gmt: string | null
	/** The globally unique identifier for the post. */
	guid: WP_PostGuid
	/** The date the post was last modified, in the site's timezone. */
	modified: string
	/** The date the post was last modified, as GMT. */
	modified_gmt: string
	/** An alphanumeric identifier for the post unique to its type. */
	slug: string
	/** A named status for the post. */
	status: WP_PostStatus
	/** Type of post. */
	type: string
	/** A password to protect access to the content and excerpt. */
	password: string
	/** Permalink template for the post. */
	permalink_template: string
	/** Slug automatically generated from the post title. */
	generated_slug: string
	/** URL to the post. */
	link: string
	/** The title for the post. */
	title: WP_PostTitle
	/** The content for the post. */
	content: WP_PostContent
	/** The ID for the author of the post. */
	author: number
	/** The excerpt for the post. */
	excerpt: WP_PostExcerpt
	/** The ID of the featured media for the post. */
	featured_media: number
	/** Whether or not comments are open on the post. */
	comment_status: WP_PostCommentStatus
	/** Whether or not the post can be pinged. */
	ping_status: WP_PostCommentStatus
	/** The format for the post. */
	format: WP_PostFormat
	/** Meta fields. */
	meta: Record<string, unknown>
	/** Whether or not the post should be treated as sticky. */
	sticky: boolean
	/** The theme file to use to display the post. */
	template: string
	/** The terms assigned to the post in the category taxonomy. */
	categories: number[]
	/** The terms assigned to the post in the post_tag taxonomy. */
	tags: number[]
	/** Hypermedia links. */
	_links?: WP_PostLinks
}

// ====================================================
// LIST — GET /wp/v2/posts
// ====================================================

export interface WP_PostListInput {
	/** Scope under which the request is made; determines fields present in response. */
	context?: WP_Context
	/** Current page of the collection. */
	page?: number
	/** Maximum number of items to be returned in result set. */
	per_page?: number
	/** Limit results to those matching a string. */
	search?: string
	/** Limit response to posts published after a given ISO8601 compliant date. */
	after?: string
	/** Limit response to posts modified after a given ISO8601 compliant date. */
	modified_after?: string
	/** Limit result set to posts assigned to specific authors. */
	author?: number | number[]
	/** Ensure result set excludes posts assigned to specific authors. */
	author_exclude?: number | number[]
	/** Limit response to posts published before a given ISO8601 compliant date. */
	before?: string
	/** Limit response to posts modified before a given ISO8601 compliant date. */
	modified_before?: string
	/** Ensure result set excludes specific IDs. */
	exclude?: number | number[]
	/** Limit result set to specific IDs. */
	include?: number | number[]
	/** Offset the result set by a specific number of items. */
	offset?: number
	/** Order sort attribute ascending or descending. */
	order?: WP_ListOrder
	/** Sort collection by post attribute. */
	orderby?: WP_PostOrderBy
	/** Array of column names to be searched. */
	search_columns?: string[]
	/** Limit result set to posts with one or more specific slugs. */
	slug?: string | string[]
	/** Limit result set to posts assigned one or more statuses. */
	status?: WP_PostStatusFilter | WP_PostStatusFilter[]
	/** Limit result set based on relationship between multiple taxonomies. */
	tax_relation?: WP_PostTaxRelation
	/** Limit result set to items with specific terms assigned in the categories taxonomy. */
	categories?: number | number[]
	/** Limit result set to items except those with specific terms assigned in the categories taxonomy. */
	categories_exclude?: number | number[]
	/** Limit result set to items with specific terms assigned in the tags taxonomy. */
	tags?: number | number[]
	/** Limit result set to items except those with specific terms assigned in the tags taxonomy. */
	tags_exclude?: number | number[]
	/** Limit result set to items that are sticky. */
	sticky?: boolean
}

export type WP_PostListErrorCode =
	| "rest_no_search_term_defined"
	| "rest_orderby_include_missing_include"
	| "rest_post_invalid_page_number"
	| "rest_forbidden_context"
	| "rest_forbidden_status"

// ====================================================
// CREATE — POST /wp/v2/posts
// ====================================================

/** Title payload accepted when creating or updating a post. */
export type WP_PostTitleInput = string | { raw: string }

/** Content payload accepted when creating or updating a post. */
export type WP_PostContentInput = string | { raw: string }

/** Excerpt payload accepted when creating or updating a post. */
export type WP_PostExcerptInput = string | { raw: string }

export interface WP_PostCreateInput {
	/** The date the post was published, in the site's timezone. */
	date?: string | null
	/** The date the post was published, as GMT. */
	date_gmt?: string | null
	/** An alphanumeric identifier for the post unique to its type. */
	slug?: string
	/** A named status for the post. */
	status?: WP_PostStatus
	/** A password to protect access to the content and excerpt. */
	password?: string
	/** The title for the post. */
	title?: WP_PostTitleInput
	/** The content for the post. */
	content?: WP_PostContentInput
	/** The ID for the author of the post. */
	author?: number
	/** The excerpt for the post. */
	excerpt?: WP_PostExcerptInput
	/** The ID of the featured media for the post. */
	featured_media?: number
	/** Whether or not comments are open on the post. */
	comment_status?: WP_PostCommentStatus
	/** Whether or not the post can be pinged. */
	ping_status?: WP_PostCommentStatus
	/** The format for the post. */
	format?: WP_PostFormat
	/** Meta fields. */
	meta?: Record<string, unknown>
	/** Whether or not the post should be treated as sticky. */
	sticky?: boolean
	/** The theme file to use to display the post. */
	template?: string
	/** The terms assigned to the post in the category taxonomy. */
	categories?: number[]
	/** The terms assigned to the post in the post_tag taxonomy. */
	tags?: number[]
}

export type WP_PostCreateErrorCode =
	| "rest_invalid_author"
	| "rest_invalid_featured_media"
	| "rest_invalid_field"
	| "rest_post_exists"
	| "rest_post_invalid_id"
	| "rest_cannot_assign_sticky"
	| "rest_cannot_assign_term"
	| "rest_cannot_create"
	| "rest_cannot_edit_others"
	| "rest_cannot_publish"

// ====================================================
// RETRIEVE — GET /wp/v2/posts/<id>
// ====================================================

export interface WP_PostRetrieveInput {
	/** Unique identifier for the post. */
	id: number
	/** Scope under which the request is made; determines fields present in response. */
	context?: WP_Context
	/** The password for the post if it is password protected. */
	password?: string
}

export type WP_PostRetrieveErrorCode = "rest_forbidden_context" | "rest_post_incorrect_password" | "rest_post_invalid_id"

// ====================================================
// UPDATE — POST /wp/v2/posts/<id>
// ====================================================

export interface WP_PostUpdateInput {
	/** Unique identifier for the post. */
	id: number
	/** The date the post was published, in the site's timezone. */
	date?: string | null
	/** The date the post was published, as GMT. */
	date_gmt?: string | null
	/** An alphanumeric identifier for the post unique to its type. */
	slug?: string
	/** A named status for the post. */
	status?: WP_PostStatus
	/** A password to protect access to the content and excerpt. */
	password?: string
	/** The title for the post. */
	title?: WP_PostTitleInput
	/** The content for the post. */
	content?: WP_PostContentInput
	/** The ID for the author of the post. */
	author?: number
	/** The excerpt for the post. */
	excerpt?: WP_PostExcerptInput
	/** The ID of the featured media for the post. */
	featured_media?: number
	/** Whether or not comments are open on the post. */
	comment_status?: WP_PostCommentStatus
	/** Whether or not the post can be pinged. */
	ping_status?: WP_PostCommentStatus
	/** The format for the post. */
	format?: WP_PostFormat
	/** Meta fields. */
	meta?: Record<string, unknown>
	/** Whether or not the post should be treated as sticky. */
	sticky?: boolean
	/** The theme file to use to display the post. */
	template?: string
	/** The terms assigned to the post in the category taxonomy. */
	categories?: number[]
	/** The terms assigned to the post in the post_tag taxonomy. */
	tags?: number[]
}

export type WP_PostUpdateErrorCode =
	| "rest_invalid_author"
	| "rest_invalid_featured_media"
	| "rest_invalid_field"
	| "rest_post_invalid_id"
	| "rest_cannot_assign_sticky"
	| "rest_cannot_assign_term"
	| "rest_cannot_edit"
	| "rest_cannot_edit_others"
	| "rest_cannot_publish"

// ====================================================
// DELETE — DELETE /wp/v2/posts/<id>
// ====================================================

export interface WP_PostDeleteInput {
	/** Unique identifier for the post. */
	id: number
	/** Whether to bypass Trash and force deletion. */
	force?: boolean
}

/**
 * Response from `DELETE /wp/v2/posts/<id>`.
 * - When `force=true`: returns `{ deleted: true, previous: WP_Post }`.
 * - When `force=false` (trashed): returns the updated `WP_Post` with `status: "trash"`.
 */
export type WP_PostDeleteResponse = WP_Post | { deleted: true; previous: WP_Post }

export type WP_PostDeleteErrorCode =
	| "rest_cannot_delete"
	| "rest_user_cannot_delete_post"
	| "rest_post_invalid_id"
	| "rest_already_trashed"
	| "rest_trash_not_supported"
