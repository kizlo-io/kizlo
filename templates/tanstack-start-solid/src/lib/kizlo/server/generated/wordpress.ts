/**
 * Repo-only, and never scaffolded: wiring writes a fresh stub from the CLI's `WORDPRESS_STUB`.
 * Kept empty on purpose. Compiling the framework's own source against a tree with nothing in it is
 * what proves it still typechecks in a project that has not generated a client yet, so only a
 * template that cannot build without endpoints should borrow the repo's own (see `nextjs`).
 */
import type { WP_Client } from "kizlo"

export const endpoints = {} as any

export type WordPressClient = WP_Client<typeof endpoints>

declare module "kizlo" {
	interface WordPressClientRegistry {
		endpoints: typeof endpoints
	}
	interface WordPressEndpointRegistry {
		[path: string]: any
	}
	interface WordPressCustomFieldsRegistry {
		[path: string]: Record<string, unknown>
	}
}
