import type { WP_Client } from "kizlo"

export const endpoints = {} as any

export type WordPressClient = WP_Client<typeof endpoints>

declare module "kizlo" {
	interface WordPressClientRegistry {
		endpoints: typeof endpoints
	}
}
