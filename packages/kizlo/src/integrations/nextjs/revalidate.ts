import type { Pathname } from "@kizlo/shared"
import { createExtension } from "../../shared/extension"
import { createEventHandler } from "../../webhook"
import type { KizloEvent } from "../../webhook/schema"
import { SITEMAP_ROUTE } from "./sitemap"

export type RevalidatePathFn = (path: string, type?: "layout" | "page") => void

/** A path to revalidate, optionally with the Next `type` a dynamic route needs (e.g. `"page"`). */
export type RevalidateTarget = Pathname | { path: Pathname; type?: "layout" | "page" }

// robots.txt always lives at `/robots.txt` (the spec fixes it regardless of how it is
// served), so its revalidation target is a constant rather than an option.
const ROBOTS_PATH = "/robots.txt"

// The sitemap defaults to the route `createSitemapRoute` serves, revalidated as a
// dynamic page so every generated sitemap refreshes at once.
const DEFAULT_SITEMAP_TARGET: RevalidateTarget = { path: SITEMAP_ROUTE, type: "page" }

export interface NextRevalidateOptions {
	revalidatePath?: RevalidatePathFn
	/** Return extra paths to revalidate for a given event, on top of the event's own URL. */
	paths?: (event: KizloEvent) => Pathname[] | Promise<Pathname[]>
	/**
	 * How to revalidate the sitemap. Defaults to the route `createSitemapRoute` serves
	 * (`/sitemaps/[sitemap]`, revalidated as a dynamic page). Override this only if you
	 * serve sitemaps from your own route(s) instead of `createSitemapRoute`; pass `false`
	 * to skip sitemap revalidation.
	 */
	sitemap?: false | RevalidateTarget | RevalidateTarget[]
}

export function nextRevalidation(options?: NextRevalidateOptions) {
	return createExtension({
		id: "nextjs-revalidation",
		init: () => ({
			events: [
				createEventHandler(async (event) => {
					if (!event) return
					if (event.type.startsWith("settings")) return

					const revalidatePath = options?.revalidatePath ?? (await import("next/cache")).revalidatePath

					const paths = [
						...(await Promise.resolve(options?.paths?.(event) ?? [])),
						...(event.data?.url ? [event.data.url] : []),
						ROBOTS_PATH,
					]
					for (const path of normalizePaths(paths)) revalidatePath(path)

					for (const target of resolveSitemapTargets(options?.sitemap)) revalidatePath(normalizePath(target.path), target.type)
				}),
			],
		}),
	})
}

function resolveSitemapTargets(option: NextRevalidateOptions["sitemap"]): { path: string; type?: "layout" | "page" }[] {
	if (option === false) return []
	const targets = option === undefined ? [DEFAULT_SITEMAP_TARGET] : Array.isArray(option) ? option : [option]
	return targets.map((target) => (typeof target === "string" ? { path: target } : target))
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
