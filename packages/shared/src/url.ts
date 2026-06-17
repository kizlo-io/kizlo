import { pathToRegexp as pathToRegexpBase } from "path-to-regexp"

/**
 * Accepts a single pattern or a non-empty array of patterns.
 * Each pattern can be either a RegExp or a path-to-regexp compatible string.
 */
export type PathMatcherParam = [RegExp | string, ...(RegExp | string)[]] | RegExp | string

/**
 * Creates a path matcher function that tests if a pathname matches any of the provided patterns.
 *
 * @param patterns - Single pattern or array of patterns to match against
 * @returns A function that takes a pathname and returns true if it matches any pattern
 *
 * @example
 * ```typescript
 * // Single pattern
 * const apiMatcher = createPathMatcher("/api/**");
 * apiMatcher("/api/users"); // true
 *
 * // Multiple patterns
 * const matcher = createPathMatcher([
 *   "/api/users/:id",
 *   "/api/posts/(.*)",
 *   /^\/admin/
 * ]);
 *
 * matcher("/api/users/123");     // true
 * matcher("/api/posts/recent");  // true
 * matcher("/admin/dashboard");   // true
 * matcher("/public/page");       // false
 * ```
 */
export function createPathMatcher(patterns: PathMatcherParam) {
	const routePatterns = [patterns].flat().filter((p): p is string | RegExp => Boolean(p))

	if (routePatterns.length === 0) return () => false

	const matchers = _precomputePathRegex(routePatterns)

	return (source: string | Request) => {
		const pathname = typeof source === "string" ? source : new URL(source.url).pathname
		return matchers.some((matcher) => matcher.test(pathname))
	}
}

function _pathToRegex(path: string) {
	try {
		return pathToRegexpBase(path)
	} catch (error) {
		throw new Error(`Invalid path "${path}": ${(error as Error).message}\nSee: https://github.com/pillarjs/path-to-regexp/tree/6.x`)
	}
}

function _precomputePathRegex(patterns: (string | RegExp)[]) {
	return patterns.map((pattern) => (pattern instanceof RegExp ? pattern : _pathToRegex(pattern)))
}

export function trimLeadingSlash(path: string): string {
	return path.replace(/^\/+/, "")
}

export function trimTrailingSlash(value: string) {
	return value.replace(/\/+$/, "")
}

export function trimLeadingTrailingSlashes(value: string): string {
	return value.replace(/^\/+|\/+$/g, "")
}

export function replaceOrigin(url: string, trustedOrigin: string): string {
	const trusted = new URL(trustedOrigin)
	const trustedBase = `${trusted.protocol}//${trusted.host}`

	// Handle relative paths
	if (url.startsWith("/")) return `${trustedBase}${url}`

	// Parse the target URL
	const target = new URL(url)

	// Replace origin (protocol + host) but keep pathname, search, hash
	return `${trustedBase}${target.pathname}${target.search}${target.hash}`
}
