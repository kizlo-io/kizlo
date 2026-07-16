import type { AnyRouter } from "@orpc/server"
import { type AnyProcedure, type AnyProcedureRouter, buildProcedure } from "./procedure"

export function createOrpcRouter(router: AnyProcedureRouter): AnyRouter {
	const cache = new Map<string, unknown>()

	return new Proxy(router, {
		get: (target, p) => {
			if (typeof p === "symbol") return (target as any)[p]
			if (cache.has(p)) return cache.get(p)

			const value = (target as any)[p]
			if (value === undefined) return undefined

			let resolved: unknown
			if (isProcedure(value)) {
				resolved = buildProcedure(value)
			} else if (typeof value === "object" && value !== null) {
				resolved = createOrpcRouter(value as AnyProcedureRouter)
			} else {
				resolved = value
			}

			cache.set(p, resolved)
			return resolved
		},
	}) as never
}

function isProcedure(value: unknown): value is AnyProcedure {
	if (typeof value !== "object" || value === null) return false
	const brand = (value as Record<string, unknown>)["~kizlo"]
	return (
		typeof brand === "object" &&
		brand !== null &&
		"options" in brand &&
		"uses" in brand &&
		"handler" in brand &&
		typeof (brand as Record<string, unknown>).handler === "function"
	)
}
