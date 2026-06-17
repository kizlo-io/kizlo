import type { WP_Context, WP_Link, WP_ListOrder } from "../types"

// ====================================================
// SHARED
// ====================================================

/** Sort collection by user attribute. */
export type WP_UserOrderBy = "id" | "include" | "name" | "registered_date" | "slug" | "include_slugs" | "email" | "url"

/** Limit result set to users who are considered authors. */
export type WP_UserWho = "authors"

/** Avatar URLs for the user, keyed by image size in pixels (e.g. "24", "48", "96"). */
export type WP_UserAvatarUrls = Record<string, string>

/** All capabilities assigned to the user, keyed by capability name. */
export type WP_UserCapabilities = Record<string, boolean>

/** Hypermedia links for the user resource. */
export interface WP_UserLinks {
	self?: WP_Link[]
	collection?: WP_Link[]
	author?: WP_Link[]
	[rel: string]: WP_Link[] | undefined
}

// ====================================================
// USER (response schema)
// ====================================================

export interface WP_User {
	/** Unique identifier for the user. */
	id: number
	/** Login name for the user. */
	username: string
	/** Display name for the user. */
	name: string
	/** First name for the user. */
	first_name: string
	/** Last name for the user. */
	last_name: string
	/** The email address for the user. */
	email: string
	/** URL of the user. */
	url: string
	/** Description of the user. */
	description: string
	/** Author URL of the user. */
	link: string
	/** Locale for the user. */
	locale: string
	/** The nickname for the user. */
	nickname: string
	/** An alphanumeric identifier for the user. */
	slug: string
	/** Registration date for the user. */
	registered_date: string
	/** Roles assigned to the user. */
	roles: string[]
	/** All capabilities assigned to the user. */
	capabilities: WP_UserCapabilities
	/** Any extra capabilities assigned to the user. */
	extra_capabilities: WP_UserCapabilities
	/** Avatar URLs for the user. */
	avatar_urls: WP_UserAvatarUrls
	/** Meta fields. */
	meta: Record<string, unknown>
	/** Hypermedia links. */
	_links?: WP_UserLinks
}

// ====================================================
// LIST — GET /wp/v2/users
// ====================================================

export interface WP_UserListInput {
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
	/** Sort collection by user attribute. */
	orderby?: WP_UserOrderBy
	/** Limit result set to users with one or more specific slugs. */
	slug?: string | string[]
	/** Limit result set to users matching at least one specific role provided. Accepts csv list or single role. */
	roles?: string | string[]
	/** Limit result set to users matching at least one specific capability provided. Accepts csv list or single capability. */
	capabilities?: string | string[]
	/** Limit result set to users who are considered authors. */
	who?: WP_UserWho
	/** Limit result set to users who have published posts. */
	has_published_posts?: boolean | string[]
}

export type WP_UserListErrorCode = "rest_forbidden_context" | "rest_forbidden_orderby" | "rest_forbidden_who" | "rest_user_cannot_view"

// ====================================================
// CREATE — POST /wp/v2/users
// ====================================================

export interface WP_UserCreateInput {
	/** Login name for the user. */
	username?: string
	/** Display name for the user. */
	name?: string
	/** First name for the user. */
	first_name?: string
	/** Last name for the user. */
	last_name?: string
	/** The email address for the user. */
	email?: string
	/** URL of the user. */
	url?: string
	/** Description of the user. */
	description?: string
	/** Locale for the user. */
	locale?: string
	/** The nickname for the user. */
	nickname?: string
	/** An alphanumeric identifier for the user. */
	slug?: string
	/** Roles assigned to the user. */
	roles?: string[]
	/** Password for the user (never included). */
	password?: string
	/** Meta fields. */
	meta?: Record<string, unknown>
}

export type WP_UserCreateErrorCode =
	| "rest_user_exists"
	| "rest_user_invalid_password"
	| "rest_user_invalid_role"
	| "rest_user_invalid_username"
	| "rest_cannot_create_user"

// ====================================================
// RETRIEVE — GET /wp/v2/users/<id>
// ====================================================

export interface WP_UserRetrieveInput {
	/** Unique identifier for the user. */
	id: number
	/** Scope under which the request is made; determines fields present in response. */
	context?: WP_Context
}

export type WP_UserRetrieveErrorCode = "rest_forbidden_context" | "rest_user_cannot_view" | "rest_user_invalid_id"

// ====================================================
// UPDATE — POST /wp/v2/users/<id>
// ====================================================

export interface WP_UserUpdateInput {
	/** Unique identifier for the user. */
	id: number
	/** Login name for the user. */
	username?: string
	/** Display name for the user. */
	name?: string
	/** First name for the user. */
	first_name?: string
	/** Last name for the user. */
	last_name?: string
	/** The email address for the user. */
	email?: string
	/** URL of the user. */
	url?: string
	/** Description of the user. */
	description?: string
	/** Locale for the user. */
	locale?: string
	/** The nickname for the user. */
	nickname?: string
	/** An alphanumeric identifier for the user. */
	slug?: string
	/** Roles assigned to the user. */
	roles?: string[]
	/** Password for the user (never included). */
	password?: string
	/** Meta fields. */
	meta?: Record<string, unknown>
}

export type WP_UserUpdateErrorCode =
	| "rest_user_invalid_argument"
	| "rest_user_invalid_email"
	| "rest_user_invalid_password"
	| "rest_user_invalid_role"
	| "rest_user_invalid_slug"
	| "rest_user_invalid_username"
	| "rest_cannot_edit"
	| "rest_cannot_edit_roles"
	| "rest_user_invalid_id"

// ====================================================
// DELETE — DELETE /wp/v2/users/<id>
// ====================================================

export interface WP_UserDeleteInput {
	/** Unique identifier for the user. */
	id: number
	/** Required to be true, as users do not support trashing. */
	force?: boolean
	/** Reassign the deleted user's posts and links to this user ID. */
	reassign?: number
}

/**
 * Response from `DELETE /wp/v2/users/<id>`.
 * Users do not support trashing, so `force=true` is required and the response
 * is always `{ deleted: true, previous: WP_User }`.
 */
export type WP_UserDeleteResponse = { deleted: true; previous: WP_User }

export type WP_UserDeleteErrorCode =
	| "rest_user_invalid_reassign"
	| "rest_user_cannot_delete"
	| "rest_user_invalid_id"
	| "rest_cannot_delete"
	| "rest_trash_not_supported"

// ====================================================
// RETRIEVE_ME — GET /wp/v2/users/me
// ====================================================

export interface WP_UserRetrieveMeInput {
	/** Scope under which the request is made; determines fields present in response. */
	context?: WP_Context
}

export type WP_UserRetrieveMeErrorCode = "rest_not_logged_in"

// ====================================================
// UPDATE_ME — POST /wp/v2/users/me
// ====================================================

export interface WP_UserUpdateMeInput {
	/** Login name for the user. */
	username?: string
	/** Display name for the user. */
	name?: string
	/** First name for the user. */
	first_name?: string
	/** Last name for the user. */
	last_name?: string
	/** The email address for the user. */
	email?: string
	/** URL of the user. */
	url?: string
	/** Description of the user. */
	description?: string
	/** Locale for the user. */
	locale?: string
	/** The nickname for the user. */
	nickname?: string
	/** An alphanumeric identifier for the user. */
	slug?: string
	/** Roles assigned to the user. */
	roles?: string[]
	/** Password for the user (never included). */
	password?: string
	/** Meta fields. */
	meta?: Record<string, unknown>
}

export type WP_UserUpdateMeErrorCode =
	| "rest_user_invalid_argument"
	| "rest_user_invalid_email"
	| "rest_user_invalid_password"
	| "rest_user_invalid_role"
	| "rest_user_invalid_slug"
	| "rest_user_invalid_username"
	| "rest_not_logged_in"
	| "rest_cannot_edit"
	| "rest_cannot_edit_roles"

// ====================================================
// DELETE_ME — DELETE /wp/v2/users/me
// ====================================================

export interface WP_UserDeleteMeInput {
	/** Required to be true, as users do not support trashing. */
	force?: boolean
	/** Reassign the deleted user's posts and links to this user ID. */
	reassign?: number
}

export type WP_UserDeleteMeResponse = { deleted: true; previous: WP_User }

export type WP_UserDeleteMeErrorCode =
	| "rest_user_invalid_reassign"
	| "rest_not_logged_in"
	| "rest_user_cannot_delete"
	| "rest_cannot_delete"
	| "rest_trash_not_supported"
