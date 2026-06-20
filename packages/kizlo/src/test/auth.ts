import type { AuthAdapter, AuthUser } from "../adapters/auth"
import type { TestAuthAdapterUser } from "./users"

export function testAuthAdapter(user: TestAuthAdapterUser): AuthAdapter {
	return {
		getUser(): AuthUser {
			return {
				id: user.wpUserId,
				email: user.email,
				phone: user.phone,
				firstName: user.firstName,
				lastName: user.lastName,
			}
		},
	}
}
