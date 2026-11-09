import { z } from "zod"

const url = z.url({ protocol: /^https?$/ })
export const screenId = z.enum(["products", "sell", "orders", "settings"])
export type ScreenId = z.infer<typeof screenId>

const bootstrapSchema = z.object({
	version: z.string().min(1),
	urls: z.object({ pos: url, wordpress: url, account: url, login: url, logout: url }),
	restRoot: url,
	nonce: z.string().min(1),
	user: z.object({ id: z.number().int().positive(), name: z.string() }),
	store: z.object({ name: z.string(), currency: z.string().min(1) }),
	navigation: z
		.array(z.object({ id: screenId, label: z.string().min(1) }))
		.length(4)
		.refine((items) => new Set(items.map((item) => item.id)).size === 4),
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
