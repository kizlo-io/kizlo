import type { WP_Context, WP_Link, WP_ListOrder } from "../types"

// ====================================================
// SHARED
// ====================================================

/** Type attribution for the term. */
export type WP_TagTaxonomy = "post_tag"

/** Sort collection by term attribute. */
export const WP_TAG_ORDER_BYS = ["id", "include", "name", "slug", "include_slugs", "term_group", "description", "count"] as const
export type WP_TagOrderBy = (typeof WP_TAG_ORDER_BYS)[number]

/** Hypermedia links for the tag resource. */
export interface WP_TagLinks {
	self?: WP_Link[]
	collection?: WP_Link[]
	about?: WP_Link[]
	"wp:post_type"?: WP_Link[]
	curies?: WP_Link[]
	[rel: string]: WP_Link[] | undefined
}

// ====================================================
// TAG (response schema)
// ====================================================

export interface WP_Tag {
	/** Unique identifier for the term. */
	id: number
	/** Number of published posts for the term. */
	count: number
	/** HTML description of the term. */
	description: string
	/** URL of the term. */
	link: string
	/** HTML title for the term. */
	name: string
	/** An alphanumeric identifier for the term unique to its type. */
	slug: string
	/** Type attribution for the term. */
	taxonomy: WP_TagTaxonomy
	/** Meta fields. */
	meta: Record<string, unknown>
	/** Hypermedia links. */
	_links?: WP_TagLinks
}

// ====================================================
// LIST — GET /wp/v2/tags
// ====================================================

export interface WP_TagListInput {
	/** Scope under which the request is made; determines fields present in response. */
	context?: WP_Context
	/** Current page of the collection. */
	page?: number
	/** Maximum number of items to be returned in result set. */
	per_page?: number
	/** Limit results to those matching a string. */
	search?: string
	/** Ensure result set excludes specific IDs. */
	exclude?: number | number[]
	/** Limit result set to specific IDs. */
	include?: number | number[]
	/** Offset the result set by a specific number of items. */
	offset?: number
	/** Order sort attribute ascending or descending. */
	order?: WP_ListOrder
	/** Sort collection by term attribute. */
	orderby?: WP_TagOrderBy
	/** Whether to hide terms not assigned to any posts. */
	hide_empty?: boolean
	/** Limit result set to terms assigned to a specific post. */
	post?: number
	/** Limit result set to terms with one or more specific slugs. */
	slug?: string | string[]
}

export type WP_TagListErrorCode = "rest_post_invalid_id" | "rest_forbidden_context"

// ====================================================
// CREATE — POST /wp/v2/tags
// ====================================================

export interface WP_TagCreateInput {
	/** HTML description of the term. */
	description?: string
	/** HTML title for the term. */
	name?: string
	/** An alphanumeric identifier for the term unique to its type. */
	slug?: string
	/** Meta fields. */
	meta?: Record<string, unknown>
}

export type WP_TagCreateErrorCode = "rest_taxonomy_not_hierarchical" | "rest_term_invalid" | "rest_cannot_create"

// ====================================================
// RETRIEVE — GET /wp/v2/tags/<id>
// ====================================================

export interface WP_TagRetrieveInput {
	/** Unique identifier for the term. */
	id: number
	/** Scope under which the request is made; determines fields present in response. */
	context?: WP_Context
}

export type WP_TagRetrieveErrorCode = "rest_forbidden_context" | "rest_term_invalid"

// ====================================================
// UPDATE — POST /wp/v2/tags/<id>
// ====================================================

export interface WP_TagUpdateInput {
	/** Unique identifier for the term. */
	id: number
	/** HTML description of the term. */
	description?: string
	/** HTML title for the term. */
	name?: string
	/** An alphanumeric identifier for the term unique to its type. */
	slug?: string
	/** Meta fields. */
	meta?: Record<string, unknown>
}

export type WP_TagUpdateErrorCode = "rest_taxonomy_not_hierarchical" | "rest_term_invalid" | "rest_cannot_update"

// ====================================================
// DELETE — DELETE /wp/v2/tags/<id>
// ====================================================

export interface WP_TagDeleteInput {
	/** Unique identifier for the term. */
	id: number
	/** Required to be true, as terms do not support trashing. */
	force?: boolean
}

/**
 * Response from `DELETE /wp/v2/tags/<id>`.
 * Terms do not support trashing, so `force=true` is required and the response
 * is always `{ deleted: true, previous: WP_Tag }`.
 */
export type WP_TagDeleteResponse = { deleted: true; previous: WP_Tag }

export type WP_TagDeleteErrorCode = "rest_cannot_delete" | "rest_term_invalid" | "rest_trash_not_supported"
