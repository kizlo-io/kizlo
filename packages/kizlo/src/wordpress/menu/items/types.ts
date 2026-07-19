import type { WP_Context, WP_Link, WP_ListOrder } from "../../types"

// ====================================================
// SHARED
// ====================================================

/** The family of objects originally represented, such as 'post_type' or 'taxonomy'. */
export type WP_MenuItemType = "taxonomy" | "post_type" | "post_type_archive" | "custom"

/** A named status for the object. Used in responses and as the input on create/update. */
export type WP_MenuItemStatus = "publish" | "future" | "draft" | "pending" | "private" | "trash"

/** Status filter values accepted by `GET /wp/v2/menu-items`. Inherits the posts controller's filter enum, widening `WP_MenuItemStatus` with internal statuses and the `any` alias. */
export type WP_MenuItemStatusFilter = WP_MenuItemStatus | "auto-draft" | "inherit" | "any"

/** The target attribute of the link element for this menu item. */
export const WP_MENU_ITEM_TARGETS = ["_blank", ""] as const
export type WP_MenuItemTarget = (typeof WP_MENU_ITEM_TARGETS)[number]

/** Sort collection by object attribute. */
export const WP_MENU_ITEM_ORDER_BYES = [
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
export type WP_MenuItemOrderBy = (typeof WP_MENU_ITEM_ORDER_BYES)[number]

/** Limit result set based on relationship between multiple taxonomies. */
export const WP_MENU_ITEM_TAX_RELATIONS = ["AND", "OR"] as const
export type WP_MenuItemTaxRelation = (typeof WP_MENU_ITEM_TAX_RELATIONS)[number]

/** The title for the menu item. */
export interface WP_MenuItemTitle {
	/** HTML title for the object, transformed for display. */
	rendered: string
	/** Title for the object, as it exists in the database. */
	raw: string
}

/** Title input for create/update — WP accepts a plain string or `{ raw }`. */
export type WP_MenuItemTitleInput = string | { raw: string }

/** Hypermedia links for the menu item resource. */
export interface WP_MenuItemLinks {
	self?: WP_Link[]
	collection?: WP_Link[]
	about?: WP_Link[]
	"version-history"?: WP_Link[]
	"predecessor-version"?: WP_Link[]
	"wp:attachment"?: WP_Link[]
	"wp:term"?: WP_Link[]
	"wp:object"?: WP_Link[]
	curies?: WP_Link[]
	[rel: string]: WP_Link[] | undefined
}

// ====================================================
// MENU ITEM (response schema)
// ====================================================

export interface WP_MenuItem {
	/** The title for the object. */
	title: WP_MenuItemTitle
	/** Unique identifier for the object. */
	id: number
	/** The singular label used to describe this type of menu item. */
	type_label: string
	/** The family of objects originally represented, such as 'post_type' or 'taxonomy'. */
	type: WP_MenuItemType
	/** A named status for the object. */
	status: WP_MenuItemStatus
	/** The ID for the parent of the object. */
	parent: number
	/** Text for the title attribute of the link element for this menu item. */
	attr_title: string
	/** Class names for the link element of this menu item. */
	classes: string[]
	/** The description of this menu item. */
	description: string
	/** The DB ID of the nav_menu_item that is this item's menu parent, if any, otherwise 0. */
	menu_order: number
	/** The type of object originally represented, such as 'category', 'post', or 'attachment'. */
	object: string
	/** The database ID of the original object this menu item represents, for example the ID for posts or the term_id for categories. */
	object_id: number
	/** The target attribute of the link element for this menu item. */
	target: WP_MenuItemTarget
	/** The URL to which this menu item points. */
	url: string
	/** The XFN relationship expressed in the link of this menu item. */
	xfn: string[]
	/** Whether the menu item represents an object that no longer exists. */
	invalid: boolean
	/** The terms assigned to the object in the nav_menu taxonomy. */
	menus: number
	/** Meta fields. */
	meta: Record<string, unknown>
	/** Hypermedia links. */
	_links?: WP_MenuItemLinks
}

// ====================================================
// LIST — GET /wp/v2/menu-items
// ====================================================

export interface WP_MenuItemListInput {
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
	/** Sort collection by object attribute. */
	orderby?: WP_MenuItemOrderBy
	/** Array of column names to be searched. */
	search_columns?: string[]
	/** Limit result set to posts with one or more specific slugs. */
	slug?: string | string[]
	/** Limit result set to posts assigned one or more statuses. */
	status?: WP_MenuItemStatusFilter | WP_MenuItemStatusFilter[]
	/** Limit result set based on relationship between multiple taxonomies. */
	tax_relation?: WP_MenuItemTaxRelation
	/** Limit result set to items with specific terms assigned in the menus taxonomy. */
	menus?: number | number[]
	/** Limit result set to items except those with specific terms assigned in the menus taxonomy. */
	menus_exclude?: number | number[]
	/** Limit result set to posts with a specific menu_order value. */
	menu_order?: number
}

export type WP_MenuItemListErrorCode =
	| "rest_no_search_term_defined"
	| "rest_orderby_include_missing_include"
	| "rest_post_invalid_page_number"
	| "rest_cannot_view"
	| "rest_forbidden_context"

// ====================================================
// CREATE — POST /wp/v2/menu-items
// ====================================================

export interface WP_MenuItemCreateInput {
	/** The title for the object. */
	title?: WP_MenuItemTitleInput
	/** The family of objects originally represented, such as 'post_type' or 'taxonomy'. */
	type?: WP_MenuItemType
	/** A named status for the object. */
	status?: WP_MenuItemStatus
	/** The ID for the parent of the object. */
	parent?: number
	/** Text for the title attribute of the link element for this menu item. */
	attr_title?: string
	/** Class names for the link element of this menu item. */
	classes?: string[]
	/** The description of this menu item. */
	description?: string
	/** The DB ID of the nav_menu_item that is this item's menu parent, if any, otherwise 0. */
	menu_order?: number
	/** The type of object originally represented, such as 'category', 'post', or 'attachment'. */
	object?: string
	/** The database ID of the original object this menu item represents, for example the ID for posts or the term_id for categories. */
	object_id?: number
	/** The target attribute of the link element for this menu item. */
	target?: WP_MenuItemTarget
	/** The URL to which this menu item points. */
	url?: string
	/** The XFN relationship expressed in the link of this menu item. */
	xfn?: string[]
	/** The terms assigned to the object in the nav_menu taxonomy. */
	menus?: number
	/** Meta fields. */
	meta?: Record<string, unknown>
}

export type WP_MenuItemCreateErrorCode =
	| "rest_invalid_author"
	| "rest_invalid_field"
	| "rest_post_exists"
	| "rest_post_invalid_id"
	| "rest_post_invalid_type"
	| "rest_term_invalid_id"
	| "rest_title_required"
	| "rest_url_required"
	| "rest_cannot_assign_sticky"
	| "rest_cannot_assign_term"
	| "rest_cannot_create"
	| "rest_cannot_edit_others"
	| "rest_cannot_publish"
	| "rest_forbidden_status"
	| "db_insert_error"

// ====================================================
// RETRIEVE — GET /wp/v2/menu-items/<id>
// ====================================================

export interface WP_MenuItemRetrieveInput {
	/** Unique identifier for the post. */
	id: number
	/** Scope under which the request is made; determines fields present in response. */
	context?: WP_Context
}

export type WP_MenuItemRetrieveErrorCode =
	| "rest_cannot_view"
	| "rest_forbidden_context"
	| "rest_post_incorrect_password"
	| "rest_post_invalid_id"

// ====================================================
// UPDATE — POST /wp/v2/menu-items/<id>
// ====================================================

export interface WP_MenuItemUpdateInput {
	/** Unique identifier for the post. */
	id: number
	/** The title for the object. */
	title?: WP_MenuItemTitleInput
	/** The family of objects originally represented, such as 'post_type' or 'taxonomy'. */
	type?: WP_MenuItemType
	/** A named status for the object. */
	status?: WP_MenuItemStatus
	/** The ID for the parent of the object. */
	parent?: number
	/** Text for the title attribute of the link element for this menu item. */
	attr_title?: string
	/** Class names for the link element of this menu item. */
	classes?: string[]
	/** The description of this menu item. */
	description?: string
	/** The DB ID of the nav_menu_item that is this item's menu parent, if any, otherwise 0. */
	menu_order?: number
	/** The type of object originally represented, such as 'category', 'post', or 'attachment'. */
	object?: string
	/** The database ID of the original object this menu item represents, for example the ID for posts or the term_id for categories. */
	object_id?: number
	/** The target attribute of the link element for this menu item. */
	target?: WP_MenuItemTarget
	/** The URL to which this menu item points. */
	url?: string
	/** The XFN relationship expressed in the link of this menu item. */
	xfn?: string[]
	/** The terms assigned to the object in the nav_menu taxonomy. */
	menus?: number
	/** Meta fields. */
	meta?: Record<string, unknown>
}

export type WP_MenuItemUpdateErrorCode =
	| "rest_invalid_author"
	| "rest_invalid_field"
	| "rest_post_invalid_id"
	| "rest_post_invalid_type"
	| "rest_term_invalid_id"
	| "rest_title_required"
	| "rest_url_required"
	| "rest_cannot_assign_sticky"
	| "rest_cannot_assign_term"
	| "rest_cannot_edit"
	| "rest_cannot_edit_others"
	| "rest_cannot_publish"
	| "rest_forbidden_status"
	| "db_update_error"

// ====================================================
// DELETE — DELETE /wp/v2/menu-items/<id>
// ====================================================

export interface WP_MenuItemDeleteInput {
	/** Unique identifier for the post. */
	id: number
	/** Whether to bypass Trash and force deletion. */
	force?: boolean
}

/**
 * Response from `DELETE /wp/v2/menu-items/<id>`.
 * Menu items do not support trashing — `force=true` is required, so the response is always `{ deleted: true, previous: WP_MenuItem }`.
 */
export type WP_MenuItemDeleteResponse = { deleted: true; previous: WP_MenuItem }

export type WP_MenuItemDeleteErrorCode =
	| "rest_cannot_delete"
	| "rest_user_cannot_delete_post"
	| "rest_post_invalid_id"
	| "rest_already_trashed"
	| "rest_trash_not_supported"
