import type { IconDescriptor } from "../../brand/icons"
import { resolveIcons } from "../../brand/icons"
import { WEB_MANIFEST_ROUTE } from "../../brand/manifest"
import type { S2SClient } from "../../kizlo"
import type { SeoHead } from "../../seo/schema"

/** A `<meta name="theme-color">` entry, optionally scoped to a `prefers-color-scheme` media query. */
export interface ThemeColor {
	media?: string
	color: string
}

/**
 * Brand + site data for the document `<head>`, resolved from WordPress settings. The `.astro`
 * head component maps this to `<title>`/`<link>`/`<meta>` tags (Astro has no `generateMetadata`,
 * and this package can't compile `.astro`, so the rendering lives in the template).
 */
export interface RootHead {
	/** Web manifest route to link with `rel="manifest"`. */
	manifest: string
	icons: { icon: IconDescriptor[]; appleTouch: IconDescriptor[] }
	/** Site origin used to resolve relative URLs, when set in WordPress. */
	metadataBase?: string
	/** Browser-chrome theme color(s); a light/dark pair carries `prefers-color-scheme` media queries. */
	themeColor: ThemeColor[]
}

/** Per-page SEO tags, mapped from a post's SEO head. Consumed by the template's head component. */
export interface PageHead {
	title: string
	description?: string
	canonical: string
	robots: string
	og: {
		type: string
		title: string
		description?: string
		url: string
		siteName: string
		locale: string
		image?: { url: string; width?: number; height?: number; alt?: string }
	}
	twitter: {
		card: string
		title: string
		description?: string
		site?: string
		creator?: string
		image?: string
		imageAlt?: string
	}
}

/** Resolve the root brand/site head from WordPress settings (icons, manifest, theme color, base URL). */
export async function resolveRootHead(client: S2SClient<[]>): Promise<RootHead> {
	const settings = await client.settings.get.call()
	const { icon, appleTouch } = resolveIcons(settings.brand)

	const light = settings.brand.theme_color
	const dark = settings.brand.theme_color_dark
	const themeColor: ThemeColor[] = []
	if (light) themeColor.push(dark ? { media: "(prefers-color-scheme: light)", color: light } : { color: light })
	if (dark) themeColor.push({ media: "(prefers-color-scheme: dark)", color: dark })

	return {
		manifest: WEB_MANIFEST_ROUTE,
		icons: { icon, appleTouch },
		metadataBase: settings.site.url || undefined,
		themeColor,
	}
}

/** Map a post's SEO head to the flat descriptors the template's head component renders. */
export function resolvePageHead(head: SeoHead): PageHead {
	return {
		title: head.title,
		description: head.og.description || undefined,
		canonical: head.canonical,
		robots: [head.robots.index, head.robots.follow, head.robots.maxSnippet, head.robots.maxImagePreview, head.robots.maxVideoPreview].join(
			", ",
		),
		og: {
			type: head.og.type,
			title: head.og.title,
			description: head.og.description || undefined,
			url: head.og.url,
			siteName: head.og.siteName,
			locale: head.og.locale,
			image: head.og.image
				? {
						url: head.og.image.url,
						width: head.og.image.width ?? undefined,
						height: head.og.image.height ?? undefined,
						alt: head.og.image.alt ?? undefined,
					}
				: undefined,
		},
		twitter: {
			card: head.twitter.card,
			title: head.twitter.title,
			description: head.twitter.description || undefined,
			site: head.twitter.site ?? undefined,
			creator: head.twitter.creator ?? undefined,
			image: head.twitter.image ?? undefined,
			imageAlt: head.twitter.imageAlt ?? undefined,
		},
	}
}
