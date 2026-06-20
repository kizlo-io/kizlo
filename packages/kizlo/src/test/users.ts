import type { TestCredentials } from "../cli/wp/types"

export interface TestAuthAdapterUser {
	wpUserId: number
	username: string
	firstName: string
	lastName: string
	email: string
	phone: string
}

const STATIC_FIELDS: Pick<TestAuthAdapterUser, "firstName" | "lastName" | "email" | "phone"> = {
	firstName: "Test",
	lastName: "Customer",
	email: "customer@example.com",
	phone: "+10000000002",
}

export function toTestUser(user: TestCredentials["users"]["user"]): TestAuthAdapterUser {
	return {
		wpUserId: user.id,
		username: user.username,
		...STATIC_FIELDS,
	}
}
