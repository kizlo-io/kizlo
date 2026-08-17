import { type IntrospectionDocument, parseIntrospectionDocument } from "./introspection"
import type { WordPressCredentials } from "./types"

export interface IntrospectionFetchResult {
	status: "modified" | "not-modified"
	document?: IntrospectionDocument
	etag?: string
}

/**
 * WordPress could not be asked, or did not answer with a contract: a transport failure, a non-2xx
 * status, a body that is not JSON. A document that parsed is never one of these, however much of it
 * WordPress had to exclude, because what to do about an exclusion is the generator's policy and not
 * this function's. It reports; {@link generateWordPressOnce} decides.
 */
export class IntrospectionFetchError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "IntrospectionFetchError"
	}
}

function authorization(credentials: WordPressCredentials): string {
	const bytes = new TextEncoder().encode(`${credentials.username}:${credentials.password}`)
	let binary = ""
	for (const byte of bytes) binary += String.fromCharCode(byte)
	return `Basic ${btoa(binary)}`
}

export async function fetchIntrospection(
	credentials: WordPressCredentials,
	options: { etag?: string; fetch?: typeof globalThis.fetch; signal?: AbortSignal } = {},
): Promise<IntrospectionFetchResult> {
	const siteBase = credentials.url.endsWith("/") ? credentials.url : `${credentials.url}/`
	const url = new URL("wp-json/kizlo/v1/introspect", siteBase)
	let response: Response
	try {
		response = await (options.fetch ?? globalThis.fetch)(url, {
			headers: {
				authorization: authorization(credentials),
				...(options.etag ? { "If-None-Match": options.etag } : {}),
			},
			signal: options.signal ?? AbortSignal.timeout(30_000),
		})
	} catch (error) {
		throw new IntrospectionFetchError(`Could not fetch ${url}: ${error instanceof Error ? error.message : String(error)}`)
	}

	if (response.status === 304) return { status: "not-modified", etag: options.etag }
	if (!response.ok) {
		let detail = ""
		try {
			detail = (await response.text()).trim()
		} catch {}
		throw new IntrospectionFetchError(`WordPress introspection returned ${response.status}${detail ? `: ${detail.slice(0, 500)}` : ""}`)
	}

	let value: unknown
	try {
		value = await response.json()
	} catch (error) {
		throw new IntrospectionFetchError(
			`WordPress introspection returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
		)
	}
	const document = parseIntrospectionDocument(value)

	return {
		status: "modified",
		document,
		etag: response.headers.get("etag") ?? `"${document.hash}"`,
	}
}
