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
