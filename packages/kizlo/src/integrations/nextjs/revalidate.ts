import type { Pathname } from "@kizlo/shared"
import { createExtension } from "../../shared/extension"
import { createEventHandler } from "../../webhook"
import type { KizloEvent } from "../../webhook/schema"
import { ROBOTS_CACHE_TAG } from "./robots"
import { SITEMAP_ROUTE } from "./sitemap"

export type RevalidatePathFn = (path: string, type?: "layout" | "page") => void

export type RevalidateTagFn = (tag: string, profile: string | { expire?: number }) => void

export type RevalidateTarget = Pathname | { path: Pathname; type?: "layout" | "page" }

const DEFAULT_SITEMAP_TARGET: RevalidateTarget = { path: SITEMAP_ROUTE, type: "layout" }

export interface NextRevalidateOptions {
	revalidatePath?: RevalidatePathFn
	revalidateTag?: RevalidateTagFn
	/** Return extra paths to revalidate for a given event, on top of the event's own URL. */
	paths?: (event: KizloEvent) => Pathname[] | Promise<Pathname[]>
	/**
	 * How to revalidate the sitemap. Defaults to the route `createSitemapRoute` serves
	 * (`/sitemaps/[sitemap]`, revalidated as a `layout` so the whole on-demand subtree
	 * refreshes at once). Override this only if you serve sitemaps from your own route(s)
	 * instead of `createSitemapRoute`; pass `false` to skip sitemap revalidation.
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

					const revalidatePath = options?.revalidatePath ?? (await import("next/cache")).revalidatePath
					const revalidateTag = options?.revalidateTag ?? (await import("next/cache")).revalidateTag

					const paths = [...(await Promise.resolve(options?.paths?.(event) ?? [])), ...(event.data?.url ? [event.data.url] : []), "/post"]
					for (const path of normalizePaths(paths)) revalidatePath(path)

					// `{ expire: 0 }` purges the tag immediately (Next 16 requires the profile arg);
					// a webhook fires precisely because the content changed, so there is no stale window to keep.
					revalidateTag(ROBOTS_CACHE_TAG, { expire: 0 })

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
