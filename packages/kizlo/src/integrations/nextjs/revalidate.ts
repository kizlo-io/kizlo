import type { Pathname } from "@kizlo/shared"
import { ROBOTS_ROUTE } from "../../seo/robots"
import { createExtension } from "../../shared/extension"
import { createEventHandler } from "../../webhook"
import type { KizloEvent } from "../../webhook/schema"
import { SITEMAP_ROUTE } from "./sitemap"

export type RevalidatePathFn = (path: string, type?: "layout" | "page") => void

/** A path to revalidate, optionally with the Next `type` a dynamic route needs (e.g. `"page"`). */
export type RevalidateTarget = Pathname | { path: Pathname; type?: "layout" | "page" }

// robots.txt always lives at `/robots.txt` (the spec fixes it), and `createRobotsRoute`
// serves it there. For this revalidation to actually take effect in production, the route
// must not be a frozen build asset: a literal path with no dynamic segment prerenders at
// build into an immutable `revalidate: false` route with no regeneration function, so on
// Vercel the purge has nothing to regenerate against and the stale copy keeps serving until
// a redeploy. The app's robots route sets a numeric `revalidate` (ISR) so it stays cached
// but regenerable. We still target it as a `layout` because the route emits a `/route` (not
// `/page`) cache tag, so a `page` revalidation would not match. See vercel/next.js#60641.
const ROBOTS_PATH = ROBOTS_ROUTE

// The sitemap defaults to the route `createSitemapRoute` serves, revalidated as a
// `layout` (not a `page`). The route has no `generateStaticParams`, so every slug
// (`index.xml`, each `{key}.xml`, `-{n}` pages) is generated purely on-demand; a `page`
// revalidation of the `[sitemap]` pattern doesn't reach those concrete on-demand entries,
// whereas a `layout` revalidation invalidates the whole `/sitemaps` subtree and refreshes
// them all at once.
const DEFAULT_SITEMAP_TARGET: RevalidateTarget = { path: SITEMAP_ROUTE, type: "layout" }

export interface NextRevalidateOptions {
	revalidatePath?: RevalidatePathFn
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

					const paths = [...(await Promise.resolve(options?.paths?.(event) ?? [])), ...(event.data?.url ? [event.data.url] : [])]
					for (const path of normalizePaths(paths)) revalidatePath(path)

					// robots.txt is a route handler, not a page, so it needs a `layout` revalidation (see ROBOTS_PATH).
					revalidatePath(ROBOTS_PATH, "layout")

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
