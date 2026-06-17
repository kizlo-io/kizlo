import { readTestCredentials } from "./env"

export interface TestUser {
	wpUserId: number
	username: string
	firstName: string
	lastName: string
	email: string
	phone: string
}

const STATIC_FIELDS: Pick<TestUser, "firstName" | "lastName" | "email" | "phone"> = {
	firstName: "Test",
	lastName: "Customer",
	email: "customer@example.com",
	phone: "+10000000002",
}

let cached: TestUser | null = null

export function getTestUser(): TestUser {
	if (cached) return cached
	const creds = readTestCredentials()
	cached = {
		wpUserId: creds.users.customer.wpUserId,
		username: creds.users.customer.username,
		...STATIC_FIELDS,
	}
	return cached
}
