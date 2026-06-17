import { z } from "zod/v4"
import { ListMetadata } from "./schema"

export function list<T extends z.ZodObject>(item: T) {
	return z.object({ items: z.array(item), meta: ListMetadata })
}

export function getObjectProperty(object: unknown, path: readonly PropertyKey[]): unknown {
	let current: unknown = object

	for (const key of path) {
		if (!isTypescriptObject(current)) {
			return undefined
		}

		current = current[key]
	}

	return current
}

export function isTypescriptObject(value: unknown): value is object & Record<PropertyKey, unknown> {
	return !!value && (typeof value === "object" || typeof value === "function")
}

export function isZodIssues(value: unknown): value is z.core.$ZodIssue[] {
	if (!Array.isArray(value) || !value.length) return false
	return value.every((item: unknown): item is z.core.$ZodIssue => {
		if (typeof item !== "object" || item === null) return false
		const obj = item as Record<string, unknown>
		if (typeof obj.code !== "string") return false
		if (!Array.isArray(obj.path)) return false

		const hasValidPath = obj.path.every((p: unknown): p is string | number => typeof p === "string" || typeof p === "number")

		if (!hasValidPath) return false
		if (typeof obj.message !== "string") return false

		return true
	})
}

export function isBrowser(): boolean {
	return typeof window !== "undefined" && typeof window.document !== "undefined"
}
