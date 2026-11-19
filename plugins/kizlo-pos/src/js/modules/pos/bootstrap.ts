import { z } from "zod"
import { securitySchema } from "./security-api"

const url = z.url({ protocol: /^https?$/ })

const bootstrapSchema = z.object({
	version: z.string().min(1),
	security: securitySchema.optional(),
	urls: z.object({ pos: url, wordpress: url, account: url, settings: url, login: url, logout: url }),
	restRoot: url,
	nonce: z.string().min(1),
	user: z.object({ id: z.number().int().positive(), name: z.string() }),
	store: z.object({ name: z.string(), currency: z.string().min(1) }),
})

export type Bootstrap = z.infer<typeof bootstrapSchema>

declare global {
	interface Window {
		kizloPos?: unknown
	}
}

export function readBootstrap(value: unknown): Bootstrap | null {
	const result = bootstrapSchema.safeParse(value)
	return result.success ? result.data : null
}
