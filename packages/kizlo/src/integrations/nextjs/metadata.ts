import type { Metadata, Viewport } from "next"
import type { IconDescriptor } from "../../brand/icons"
import { resolveIcons } from "../../brand/icons"
import { WEB_MANIFEST_ROUTE } from "../../brand/manifest"
import type { S2SClient } from "../../kizlo"
import type { SeoHead } from "../../seo/schema"

export function createRootMetadata(client: S2SClient<[]>) {
	return async function generateMetadata(): Promise<Metadata> {
		const settings = await client.settings.get.call()
		const { icon, appleTouch } = resolveIcons(settings.brand)

		const metadata: Metadata = {
			manifest: WEB_MANIFEST_ROUTE,
			icons: {
				icon: icon.map(toNextIcon),
				apple: appleTouch.map(toNextIcon),
			},
		}

		if (settings.site.url) metadata.metadataBase = new URL(settings.site.url)

		return metadata
	}
}

/**
 * Root `generateViewport` for `app/layout.tsx`. Emits `<meta name="theme-color">`
 * from the brand theme color so the mobile browser chrome (address bar/toolbar)
 * is tinted for regular visitors — distinct from the manifest `theme_color`,
 * which only applies once the site is installed as an app. When a dark variant
 * is set, both are emitted with `prefers-color-scheme` media queries.
 */
export function createRootViewport(client: S2SClient<[]>) {
	return async function generateViewport(): Promise<Viewport> {
		const { brand } = await client.settings.get.call()
		const light = brand.theme_color
		const dark = brand.theme_color_dark

		const themeColor: Exclude<Viewport["themeColor"], string | undefined> = []
		if (light) themeColor.push(dark ? { media: "(prefers-color-scheme: light)", color: light } : { color: light })
		if (dark) themeColor.push({ media: "(prefers-color-scheme: dark)", color: dark })

		return themeColor.length ? { themeColor } : {}
	}
}

function toNextIcon(icon: IconDescriptor): IconDescriptor {
	return { url: icon.url, type: icon.type, sizes: icon.sizes }
}

export function createPageMetadata(head: SeoHead): Metadata {
	return {
		title: { absolute: head.title },
		description: head.og.description || undefined,
		alternates: { canonical: head.canonical },
		robots: [head.robots.index, head.robots.follow, head.robots.maxSnippet, head.robots.maxImagePreview, head.robots.maxVideoPreview].join(
			", ",
		),
		openGraph: {
			type: head.og.type as any,
			title: head.og.title,
			description: head.og.description || undefined,
			url: head.og.url,
			siteName: head.og.siteName,
			locale: head.og.locale,
			images: head.og.image
				? [
						{
							url: head.og.image.url,
							width: head.og.image.width ?? undefined,
							height: head.og.image.height ?? undefined,
							alt: head.og.image.alt ?? undefined,
						},
					]
				: undefined,
		},
		twitter: {
			card: head.twitter.card,
			title: head.twitter.title,
			description: head.twitter.description || undefined,
			site: head.twitter.site ?? undefined,
			creator: head.twitter.creator ?? undefined,
			images: head.twitter.image ? [{ url: head.twitter.image, alt: head.twitter.imageAlt ?? undefined }] : undefined,
		},
	}
}
