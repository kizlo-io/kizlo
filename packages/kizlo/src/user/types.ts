import type { WP_User } from "../wordpress"

export type KizloUserIdentifierField = "id" | "username" | "email"

// ====================================================
// RETRIEVE — GET /kizlo/v1/users/<field>/<value>
// ====================================================

export type KizloUserRetrieveErrorCode = "rest_user_invalid_id"

// ====================================================
// UPDATE — POST /kizlo/v1/users/<field>/<value>
// ====================================================

export interface KizloUserUpdateInput {
	email?: string
	first_name?: string
	last_name?: string
	password?: string
	meta?: Record<string, unknown>
}

export type KizloUserUpdateErrorCode = "rest_user_invalid_id"

// ====================================================
// DELETE — DELETE /kizlo/v1/users/<field>/<value>
// ====================================================

export interface KizloUserDeleteInput {
	force?: boolean
	reassign?: number
}

export type KizloUserDeleteResponse = WP_User

export type KizloUserDeleteErrorCode = "invalid_credentials" | "rest_user_invalid_id"

// ====================================================
// VERIFY — POST /kizlo/v1/users/verify
// ====================================================

export interface KizloUserVerifyInput {
	username: string
	password: string
}

export type KizloUserVerifyErrorCode = "invalid_credentials"
