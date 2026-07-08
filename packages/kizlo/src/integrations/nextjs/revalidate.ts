import { createExtension } from "../../shared/extension"
import { createEventHandler } from "../../webhook"
import type { KizloEvent } from "../../webhook/schema"

export type RevalidatePathFn = (path: string, type?: "layout" | "page") => void

export interface NextRevalidateOptions {
	paths?: (event: KizloEvent) => string | string[] | Promise<string | string[]>
	revalidatePath?: RevalidatePathFn
}

export function nextRevalidation(options: boolean | NextRevalidateOptions = true) {
	return createExtension({
		id: "nextjs-revalidation",
		init: () => ({
			events: [
				createEventHandler(async (event) => {
					if (!event) return
					if (event.type.startsWith("settings")) return
					const ops = typeof options === "boolean" ? undefined : options

					const paths = (await ops?.paths?.(event)) ?? (event.data?.url ? [event.data.url] : [])
					const revalidatePath = ops?.revalidatePath ?? (await import("next/cache")).revalidatePath

					for (const path of normalizePaths(Array.isArray(paths) ? paths : [paths])) revalidatePath(path)
				}),
			],
		}),
	})
}

function normalizePaths(paths: string | string[] | null | undefined): string[] {
	return Array.from(new Set((Array.isArray(paths) ? paths : paths ? [paths] : []).map(normalizePath).filter(Boolean)))
}

function normalizePath(path: string): string {
	try {
		return normalizePath(new URL(path).pathname)
	} catch {
		const trimmed = path.trim()
		if (!trimmed) return ""
		return trimmed.startsWith("/") ? trimmed : `/${trimmed}`
	}
}
