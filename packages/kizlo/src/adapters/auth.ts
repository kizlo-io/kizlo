import type { Promisify } from "@kizlo/shared"

export interface AuthUser {
	/** The WordPress user id this caller maps to. */
	id: number
	/** The user's email, if known. */
	email?: string
	/** The user's phone number, if known. */
	phone?: string
	/** The user's first name. */
	firstName: string
	/** The user's last name. */
	lastName: string
}

export type AuthGetUser = (request: Request | null) => Promisify<AuthUser | null>

export interface AuthAdapter {
	/** Resolve the authenticated user from the request, or `null` when there is no session. Receives `null` for server-side (non-HTTP) invocations. */
	getUser: AuthGetUser
}

/** Author a custom auth adapter, typed against the {@link AuthAdapter} contract. */
export function createAuthAdapter(adapter: AuthAdapter): AuthAdapter {
	return adapter
}

export function authMock(options?: { mockUserId?: number }): AuthAdapter {
	return {
		getUser() {
			return {
				id: options?.mockUserId ?? 0,
				firstName: "Karan",
				lastName: "Gill",
				email: "karan@gmail.con",
				phone: "12345678901",
			}
		},
	}
}
