import type { TestCredentials } from "../cli/wp/types"

export interface TestAuthAdapterUser {
	id: string
	email: string
	firstName: string
	lastName: string
}

export function toTestUser(user: TestCredentials["users"]["user"]): TestAuthAdapterUser {
	return {
		// A third-party auth id, decoupled from the WordPress user. The email is the join key.
		id: String(user.id),
		email: user.email,
		firstName: "Test",
		lastName: "Customer",
	}
}
