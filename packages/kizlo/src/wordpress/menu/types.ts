// ====================================================
// SHARED
// ====================================================

import type { WP_Context, WP_Link, WP_ListOrder } from "../types"

/** Sort collection by term attribute. */
export type WP_MenuOrderBy = "id" | "include" | "name" | "slug" | "include_slugs" | "term_group" | "description" | "count"

/** Hypermedia links for the menu resource. */
export interface WP_MenuLinks {
	self?: WP_Link[]
	collection?: WP_Link[]
	about?: WP_Link[]
	"wp:post_type"?: WP_Link[]
	curies?: WP_Link[]
	[rel: string]: WP_Link[] | undefined
}

// ====================================================
// MENU (response schema)
// ====================================================

export interface WP_Menu {
	/** Unique identifier for the term. */
	id: number
	/** HTML description of the term. */
	description: string
	/** HTML title for the term. */
	name: string
	/** An alphanumeric identifier for the term unique to its type. */
	slug: string
	/** Meta fields. */
	meta: Record<string, unknown>
	/** The locations assigned to the menu. */
	locations: string[]
	/** Whether to automatically add top level pages to this menu. */
	auto_add: boolean
	/** Hypermedia links. */
	_links?: WP_MenuLinks
}

// ====================================================
// LIST — GET /wp/v2/menus
// ====================================================

export interface WP_MenuListInput {
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
	orderby?: WP_MenuOrderBy
	/** Whether to hide terms not assigned to any posts. */
	hide_empty?: boolean
	/** Limit result set to terms assigned to a specific post. */
	post?: number
	/** Limit result set to terms with one or more specific slugs. */
	slug?: string | string[]
}

export type WP_MenuListErrorCode = "rest_post_invalid_id" | "rest_cannot_view" | "rest_forbidden_context"

// ====================================================
// CREATE — POST /wp/v2/menus
// ====================================================

export interface WP_MenuCreateInput {
	/** HTML title for the term. */
	name?: string
	/** HTML description of the term. */
	description?: string
	/** An alphanumeric identifier for the term unique to its type. */
	slug?: string
	/** Meta fields. */
	meta?: Record<string, unknown>
	/** The locations assigned to the menu. */
	locations?: string[]
	/** Whether to automatically add top level pages to this menu. */
	auto_add?: boolean
}

export type WP_MenuCreateErrorCode =
	| "rest_invalid_menu_location"
	| "rest_taxonomy_not_hierarchical"
	| "rest_term_invalid"
	| "rest_cannot_create"

// ====================================================
// RETRIEVE — GET /wp/v2/menus/<id>
// ====================================================

export interface WP_MenuRetrieveInput {
	/** Unique identifier for the term. */
	id: number
	/** Scope under which the request is made; determines fields present in response. */
	context?: WP_Context
}

export type WP_MenuRetrieveErrorCode = "rest_cannot_view" | "rest_forbidden_context" | "rest_term_invalid"

// ====================================================
// UPDATE — POST /wp/v2/menus/<id>
// ====================================================

export interface WP_MenuUpdateInput {
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
	/** The locations assigned to the menu. */
	locations?: string[]
	/** Whether to automatically add top level pages to this menu. */
	auto_add?: boolean
}

export type WP_MenuUpdateErrorCode =
	| "rest_invalid_menu_location"
	| "rest_taxonomy_not_hierarchical"
	| "rest_term_invalid"
	| "rest_cannot_update"

// ====================================================
// DELETE — DELETE /wp/v2/menus/<id>
// ====================================================

export interface WP_MenuDeleteInput {
	/** Unique identifier for the term. */
	id: number
	/** Required to be true, as terms do not support trashing. */
	force?: boolean
}

/**
 * Response from `DELETE /wp/v2/menus/<id>`.
 * Menus do not support trashing — `force=true` is required, so the response is always `{ deleted: true, previous: WP_Menu }`.
 */
export type WP_MenuDeleteResponse = { deleted: true; previous: WP_Menu }

export type WP_MenuDeleteErrorCode = "rest_cannot_delete" | "rest_term_invalid" | "rest_trash_not_supported"
