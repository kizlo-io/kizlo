import type { AuthAdapter, AuthUser } from "kizlo"
import { getTestUser } from "./users"

export const testAuthAdapter: AuthAdapter = {
	getUser(): AuthUser {
		const user = getTestUser()
		return {
			id: user.wpUserId,
			email: user.email,
			phone: user.phone,
			firstName: user.firstName,
			lastName: user.lastName,
		}
	},
}
