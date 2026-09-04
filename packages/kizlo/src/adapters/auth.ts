import type { JsonValue, Promisify } from "@kizlo/shared"

export interface AuthUser {
	/** The third-party auth id. This is the identity provider's own id, never a WordPress user id. */
	id: string
	/** The user's email. The single join key that maps this session to a WordPress user. */
	email: string
	/** The user's first name, if known. */
	firstName?: string
	/** The user's last name, if known. */
	lastName?: string
	/** Arbitrary claims the auth service carries alongside the identity. */
	meta?: Record<string, JsonValue>
}

export type AuthGetSession = (request: Request | null) => Promisify<AuthUser | null>

export interface AuthAdapter {
	/** Resolve the authenticated session from the request, or `null` when there is no session. Receives `null` for server-side (non-HTTP) invocations. */
	getSession: AuthGetSession
}

/** Author a custom auth adapter, typed against the {@link AuthAdapter} contract. */
export function createAuthAdapter(adapter: AuthAdapter): AuthAdapter {
	return adapter
}

export function authMock(options?: { id?: string; email?: string }): AuthAdapter {
	return {
		getSession() {
			return {
				id: options?.id ?? "auth-mock-user",
				email: options?.email ?? "karan@gmail.com",
				firstName: "Karan",
				lastName: "Gill",
			}
		},
	}
}
