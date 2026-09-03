import type { AuthAdapter, AuthUser } from "../adapters/auth"
import type { TestAuthAdapterUser } from "./users"

export function testAuthAdapter(user: TestAuthAdapterUser): AuthAdapter {
	return {
		getSession(): AuthUser {
			return {
				id: user.id,
				email: user.email,
				firstName: user.firstName,
				lastName: user.lastName,
			}
		},
	}
}
