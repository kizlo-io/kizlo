import type { Promisify } from "@kizlo/shared"

export interface AuthUser {
	id: number
	email?: string
	phone?: string
	firstName: string
	lastName: string
}

export interface AuthAdapter {
	getUser(request: Request | null): Promisify<AuthUser | null>
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
