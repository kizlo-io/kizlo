import { resolveIcons } from "../../brand/icons"
import { WEB_MANIFEST_ROUTE } from "../../brand/manifest"
import type { S2SClient } from "../../kizlo"
import type { LinkDescriptor, MetaDescriptor, RouteHead } from "./metadata"

/**
 * Resolve the root route's brand `head` from WordPress settings: the web manifest link, `rel="icon"`
 * and `rel="apple-touch-icon"` links, and the `theme-color` meta (a light/dark pair carries
 * `prefers-color-scheme` media queries). Server-only — it holds the server-to-server `client` — so the
 * template calls it through a server function in the root route's loader and feeds the result to `head`.
 * Per-page SEO (title, Open Graph, canonical) is layered on by {@link resolvePageHead} in child routes.
 */
export async function resolveRootHead(client: S2SClient<[]>): Promise<RouteHead> {
	const settings = await client.settings.get.call()
	const { icon, appleTouch } = resolveIcons(settings.brand)

	const meta: MetaDescriptor[] = []
	const light = settings.brand.theme_color
	const dark = settings.brand.theme_color_dark
	if (light)
		meta.push(
			dark ? { name: "theme-color", content: light, media: "(prefers-color-scheme: light)" } : { name: "theme-color", content: light },
		)
	if (dark) meta.push({ name: "theme-color", content: dark, media: "(prefers-color-scheme: dark)" })

	const links: LinkDescriptor[] = [{ rel: "manifest", href: WEB_MANIFEST_ROUTE }]
	for (const entry of icon) links.push({ rel: "icon", href: entry.url, type: entry.type, sizes: entry.sizes })
	for (const entry of appleTouch) links.push({ rel: "apple-touch-icon", href: entry.url, type: entry.type, sizes: entry.sizes })

	return { meta, links }
}
