import type { SeoHead } from "../../seo/schema"
import { renderJsonLd } from "../../seo/utils"

export { renderJsonLd }

/**
 * A single `<meta>` descriptor in a TanStack Router route `head`. The shape is structural — one of
 * `title`, `charSet`, `name`+`content`, or `property`+`content` — so this integration never has to
 * depend on `@tanstack/react-router` (which stays an optional peer). `HeadContent` renders it.
 */
export interface MetaDescriptor {
	title?: string
	charSet?: string
	name?: string
	property?: string
	content?: string
	media?: string
}

/** A `<link>` descriptor for a route `head` — `rel`/`href` plus the optional icon hints. */
export interface LinkDescriptor {
	rel: string
	href: string
	type?: string
	sizes?: string
	media?: string
}

/** A `<script>` descriptor for a route `head`; carries JSON-LD as element text via `children`. */
export interface ScriptDescriptor {
	type?: string
	children?: string
}

/** The object a route's `head` returns — the `meta`/`links`/`scripts` arrays TanStack merges down the tree. */
export interface RouteHead {
	meta?: MetaDescriptor[]
	links?: LinkDescriptor[]
	scripts?: ScriptDescriptor[]
}

/**
 * Map a post's SEO head to the `head` a TanStack Router route returns: title/description/robots, Open
 * Graph, Twitter, the canonical link, and the JSON-LD script. Pure and framework-agnostic, so it is safe
 * to call from `head`, which runs on both server and client. Takes the already-serialized `jsonLd` string
 * (from {@link renderJsonLd}) rather than the raw schema, because a route's loader payload — which feeds
 * `head` — must be JSON-serializable, and the schema graph is typed with `unknown`. The root route
 * supplies the brand defaults (icons, manifest, theme color) via {@link resolveRootHead}; TanStack merges
 * a child's `name`/`property`/`title` entries over the root's.
 */
export function resolvePageHead(head: SeoHead, jsonLd?: string | null): RouteHead {
	const meta: MetaDescriptor[] = [
		{ title: head.title },
		{
			name: "robots",
			content: [
				head.robots.index,
				head.robots.follow,
				head.robots.maxSnippet,
				head.robots.maxImagePreview,
				head.robots.maxVideoPreview,
			].join(", "),
		},
	]

	if (head.og.description) meta.push({ name: "description", content: head.og.description })

	meta.push({ property: "og:type", content: head.og.type })
	meta.push({ property: "og:title", content: head.og.title })
	if (head.og.description) meta.push({ property: "og:description", content: head.og.description })
	meta.push({ property: "og:url", content: head.og.url })
	meta.push({ property: "og:site_name", content: head.og.siteName })
	meta.push({ property: "og:locale", content: head.og.locale })
	if (head.og.image) {
		meta.push({ property: "og:image", content: head.og.image.url })
		if (head.og.image.width) meta.push({ property: "og:image:width", content: String(head.og.image.width) })
		if (head.og.image.height) meta.push({ property: "og:image:height", content: String(head.og.image.height) })
		if (head.og.image.alt) meta.push({ property: "og:image:alt", content: head.og.image.alt })
	}

	meta.push({ name: "twitter:card", content: head.twitter.card })
	meta.push({ name: "twitter:title", content: head.twitter.title })
	if (head.twitter.description) meta.push({ name: "twitter:description", content: head.twitter.description })
	if (head.twitter.site) meta.push({ name: "twitter:site", content: head.twitter.site })
	if (head.twitter.creator) meta.push({ name: "twitter:creator", content: head.twitter.creator })
	if (head.twitter.image) meta.push({ name: "twitter:image", content: head.twitter.image })
	if (head.twitter.imageAlt) meta.push({ name: "twitter:image:alt", content: head.twitter.imageAlt })

	const links: LinkDescriptor[] = [{ rel: "canonical", href: head.canonical }]

	const scripts: ScriptDescriptor[] = jsonLd ? [{ type: "application/ld+json", children: jsonLd }] : []

	return { meta, links, scripts }
}
