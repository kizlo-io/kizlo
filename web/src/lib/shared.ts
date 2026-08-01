export const appName = "Kizlo"
export const appDescription =
	"Kizlo is the framework for headless WordPress — build websites, mobile apps, and agentic applications on a stack you host and own from top to bottom."
export const siteUrl = "https://kizlo.io"
export const docsRoute = "/docs"
export const docsImageRoute = "/og/docs"
export const docsContentRoute = "/llms.mdx/docs"

export const gitConfig = {
	user: "kizlo-io",
	repo: "kizlo",
	branch: "main",
}

export const socials = [
	{ label: "GitHub", href: `https://github.com/${gitConfig.user}` },
	{ label: "Discord", href: "https://discord.com/invite/MjAUZamx5g" },
	{ label: "Twitter", href: "https://x.com/kizlo_io" },
	{ label: "Bluesky", href: "https://bsky.app/profile/kizlo.io" },
]

/** Structural shape of a Next.js App Router page's props, matching `PageProps<Route>`. */
export interface PagePropsLike {
	params: Promise<Record<string, string | string[] | undefined>>
	searchParams: Promise<Record<string, string | string[] | undefined>>
}

export interface ParsedPageProps {
	params: { identifier: string }
	query: { previewToken?: string }
}

/**
 * Await a page's `params`/`searchParams` and shape them into the argument a
 * Kizlo `get` call expects: the dynamic route segment as `identifier` and the
 * `preview_token` search param as `previewToken`.
 *
 * By default the single dynamic segment is used as the identifier; pass
 * `paramKey` when a route has more than one segment.
 */
export async function parsePageProps(props: PagePropsLike, paramKey?: string): Promise<ParsedPageProps> {
	const [params, searchParams] = await Promise.all([props.params, props.searchParams])

	const rawIdentifier = paramKey ? params[paramKey] : Object.values(params)[0]
	const identifier = Array.isArray(rawIdentifier) ? rawIdentifier.at(-1) : rawIdentifier

	const rawToken = searchParams.preview_token
	const previewToken = Array.isArray(rawToken) ? rawToken[0] : rawToken

	return {
		params: { identifier: identifier ?? "" },
		query: { previewToken },
	}
}
