// ====================================================
// SHARED
// ====================================================

import type { WP_Context, WP_Link, WP_ListOrder } from "../types"

/** A named status for the page. Used in responses and as the input on create/update. */
export const WP_PAGE_STATUSES = ["publish", "future", "draft", "pending", "private", "trash"] as const
export type WP_PageStatus = (typeof WP_PAGE_STATUSES)[number]

/** Status filter values accepted by `GET /wp/v2/pages`. Widens `WP_PageStatus` with WP-internal statuses and the `any` alias. */
export type WP_PageStatusFilter = WP_PageStatus | "auto-draft" | "inherit" | "any"

/** Whether or not comments / pings are open on the page. */
export type WP_PageCommentStatus = "open" | "closed"

/** Sort collection by page attribute. */
export const WP_PAGE_ORDER_BYES = [
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
	"menu_order",
] as const
export type WP_PageOrderBy = (typeof WP_PAGE_ORDER_BYES)[number]

/** The globally unique identifier for the page. */
export interface WP_PageGuid {
	/** GUID for the page, transformed for display. */
	rendered: string
	/** GUID for the page, as it exists in the database. */
	raw: string
}

/** The title for the page. */
export interface WP_PageTitle {
	/** HTML title for the page, transformed for display. */
	rendered: string
	/** Title for the page, as it exists in the database. */
	raw: string
}

/** The content for the page. */
export interface WP_PageContent {
	/** HTML content for the page, transformed for display. */
	rendered: string
	/** Content for the page, as it exists in the database. */
	raw: string
	/** Version of the block format used in the page. */
	block_version: number
	/** Whether the content is protected with a password. */
	protected: boolean
}

/** The excerpt for the page. */
export interface WP_PageExcerpt {
	/** HTML excerpt for the page, transformed for display. */
	rendered: string
	/** Excerpt for the page, as it exists in the database. */
	raw: string
	/** Whether the excerpt is protected with a password. */
	protected: boolean
}

/** Hypermedia links for the page resource. */
export interface WP_PageLinks {
	self?: WP_Link[]
	collection?: WP_Link[]
	about?: WP_Link[]
	author?: WP_Link[]
	replies?: WP_Link[]
	"version-history"?: WP_Link[]
	"predecessor-version"?: WP_Link[]
	up?: WP_Link[]
	"wp:featuredmedia"?: WP_Link[]
	"wp:attachment"?: WP_Link[]
	curies?: WP_Link[]
	[rel: string]: WP_Link[] | undefined
}

// ====================================================
// PAGE (response schema)
// ====================================================

export interface WP_Page {
	/** Unique identifier for the page. */
	id: number
	/** The date the page was published, in the site's timezone. */
	date: string | null
	/** The date the page was published, as GMT. */
	date_gmt: string | null
	/** The globally unique identifier for the page. */
	guid: WP_PageGuid
	/** The date the page was last modified, in the site's timezone. */
	modified: string
	/** The date the page was last modified, as GMT. */
	modified_gmt: string
	/** An alphanumeric identifier for the page unique to its type. */
	slug: string
	/** A named status for the page. */
	status: WP_PageStatus
	/** Type of post. */
	type: string
	/** A password to protect access to the content and excerpt. */
	password: string
	/** Permalink template for the page. */
	permalink_template: string
	/** Slug automatically generated from the page title. */
	generated_slug: string
	/** The ID for the parent of the page. */
	parent: number
	/** URL to the page. */
	link: string
	/** The title for the page. */
	title: WP_PageTitle
	/** The content for the page. */
	content: WP_PageContent
	/** The ID for the author of the page. */
	author: number
	/** The excerpt for the page. */
	excerpt: WP_PageExcerpt
	/** The ID of the featured media for the page. */
	featured_media: number
	/** Whether or not comments are open on the page. */
	comment_status: WP_PageCommentStatus
	/** Whether or not the page can be pinged. */
	ping_status: WP_PageCommentStatus
	/** The order of the page in relation to other pages. */
	menu_order: number
	/** Meta fields. */
	meta: Record<string, unknown>
	/** The theme file to use to display the page. */
	template: string
	/** Hypermedia links. */
	_links?: WP_PageLinks
}

// ====================================================
// LIST — GET /wp/v2/pages
// ====================================================

export interface WP_PageListInput {
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
	/** Limit result set to posts with a specific menu_order value. */
	menu_order?: number
	/** Offset the result set by a specific number of items. */
	offset?: number
	/** Order sort attribute ascending or descending. */
	order?: WP_ListOrder
	/** Sort collection by post attribute. */
	orderby?: WP_PageOrderBy
	/** Limit result set to items with particular parent IDs. */
	parent?: number | number[]
	/** Limit result set to all items except those of a particular parent ID. */
	parent_exclude?: number | number[]
	/** Array of column names to be searched. */
	search_columns?: string[]
	/** Limit result set to posts with one or more specific slugs. */
	slug?: string | string[]
	/** Limit result set to posts assigned one or more statuses. */
	status?: WP_PageStatusFilter | WP_PageStatusFilter[]
}

export type WP_PageListErrorCode =
	| "rest_no_search_term_defined"
	| "rest_orderby_include_missing_include"
	| "rest_post_invalid_page_number"
	| "rest_forbidden_context"
	| "rest_forbidden_status"

// ====================================================
// CREATE — POST /wp/v2/pages
// ====================================================

/** Title payload accepted when creating or updating a page. */
export type WP_PageTitleInput = string | { raw: string }

/** Content payload accepted when creating or updating a page. */
export type WP_PageContentInput = string | { raw: string }

/** Excerpt payload accepted when creating or updating a page. */
export type WP_PageExcerptInput = string | { raw: string }

export interface WP_PageCreateInput {
	/** The date the page was published, in the site's timezone. */
	date?: string | null
	/** The date the page was published, as GMT. */
	date_gmt?: string | null
	/** An alphanumeric identifier for the page unique to its type. */
	slug?: string
	/** A named status for the page. */
	status?: WP_PageStatus
	/** A password to protect access to the content and excerpt. */
	password?: string
	/** The ID for the parent of the page. */
	parent?: number
	/** The title for the page. */
	title?: WP_PageTitleInput
	/** The content for the page. */
	content?: WP_PageContentInput
	/** The ID for the author of the page. */
	author?: number
	/** The excerpt for the page. */
	excerpt?: WP_PageExcerptInput
	/** The ID of the featured media for the page. */
	featured_media?: number
	/** Whether or not comments are open on the page. */
	comment_status?: WP_PageCommentStatus
	/** Whether or not the page can be pinged. */
	ping_status?: WP_PageCommentStatus
	/** The order of the page in relation to other pages. */
	menu_order?: number
	/** Meta fields. */
	meta?: Record<string, unknown>
	/** The theme file to use to display the page. */
	template?: string
}

export type WP_PageCreateErrorCode =
	| "rest_invalid_author"
	| "rest_invalid_featured_media"
	| "rest_post_exists"
	| "rest_post_invalid_id"
	| "rest_cannot_create"
	| "rest_cannot_edit_others"
	| "rest_cannot_publish"

// ====================================================
// RETRIEVE — GET /wp/v2/pages/<id>
// ====================================================

export interface WP_PageRetrieveInput {
	/** Unique identifier for the page. */
	id: number
	/** Scope under which the request is made; determines fields present in response. */
	context?: WP_Context
	/** The password for the page if it is password protected. */
	password?: string
}

export type WP_PageRetrieveErrorCode = "rest_forbidden_context" | "rest_post_incorrect_password" | "rest_post_invalid_id"

// ====================================================
// UPDATE — POST /wp/v2/pages/<id>
// ====================================================

export interface WP_PageUpdateInput {
	/** Unique identifier for the page. */
	id: number
	/** The date the page was published, in the site's timezone. */
	date?: string | null
	/** The date the page was published, as GMT. */
	date_gmt?: string | null
	/** An alphanumeric identifier for the page unique to its type. */
	slug?: string
	/** A named status for the page. */
	status?: WP_PageStatus
	/** A password to protect access to the content and excerpt. */
	password?: string
	/** The ID for the parent of the page. */
	parent?: number
	/** The title for the page. */
	title?: WP_PageTitleInput
	/** The content for the page. */
	content?: WP_PageContentInput
	/** The ID for the author of the page. */
	author?: number
	/** The excerpt for the page. */
	excerpt?: WP_PageExcerptInput
	/** The ID of the featured media for the page. */
	featured_media?: number
	/** Whether or not comments are open on the page. */
	comment_status?: WP_PageCommentStatus
	/** Whether or not the page can be pinged. */
	ping_status?: WP_PageCommentStatus
	/** The order of the page in relation to other pages. */
	menu_order?: number
	/** Meta fields. */
	meta?: Record<string, unknown>
	/** The theme file to use to display the page. */
	template?: string
}

export type WP_PageUpdateErrorCode =
	| "rest_invalid_author"
	| "rest_invalid_featured_media"
	| "rest_post_invalid_id"
	| "rest_cannot_edit"
	| "rest_cannot_edit_others"
	| "rest_cannot_publish"

// ====================================================
// DELETE — DELETE /wp/v2/pages/<id>
// ====================================================

export interface WP_PageDeleteInput {
	/** Unique identifier for the page. */
	id: number
	/** Whether to bypass Trash and force deletion. */
	force?: boolean
}

/**
 * Response from `DELETE /wp/v2/pages/<id>`.
 * - When `force=true`: returns `{ deleted: true, previous: WP_Page }`.
 * - When `force=false` (trashed): returns the updated `WP_Page` with `status: "trash"`.
 */
export type WP_PageDeleteResponse = WP_Page | { deleted: true; previous: WP_Page }

export type WP_PageDeleteErrorCode =
	| "rest_cannot_delete"
	| "rest_user_cannot_delete_post"
	| "rest_post_invalid_id"
	| "rest_already_trashed"
	| "rest_trash_not_supported"
