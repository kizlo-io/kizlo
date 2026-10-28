import { createPathMatcher } from "@kizlo/shared"
import { type AnyRequestMiddleware, createIsomorphicFn, createMiddleware } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"

export type MiddlewareMatcher = string | readonly string[] | ((request: Request) => boolean)

const currentRequest = createIsomorphicFn()
	.client(() => undefined)
	.server(() => getRequest())

/** Wrap native request middleware with a path-to-regexp pattern or synchronous request predicate. */
export function matchMiddleware<Middleware extends AnyRequestMiddleware>(middleware: Middleware, matcher: MiddlewareMatcher) {
	const patterns = typeof matcher === "function" ? [] : typeof matcher === "string" ? [matcher] : matcher
	if (patterns.some((pattern) => !pattern.startsWith("/"))) throw new TypeError("Middleware patterns must start with /.")
	const [first, ...rest] = patterns
	const matches = typeof matcher === "function" ? matcher : first === undefined ? () => false : createPathMatcher([first, ...rest])
	const wrapped = createMiddleware()
		.middleware([middleware])
		.server(({ next }) => next())
	const options = wrapped.options
	// An undefined server handler stops Start's pipeline instead of advancing to the next handler.
	const skipped = { server: options.server }
	const decisions = new WeakMap<Request, boolean>()
	// Start flattens dependencies before invoking server handlers. Select the whole chain at that point.
	Object.defineProperty(wrapped, "options", {
		get() {
			const request = currentRequest()
			if (!request) return {}
			let selected = decisions.get(request)
			if (selected === undefined) {
				selected = matches(request)
				if (typeof selected !== "boolean") throw new TypeError("Middleware predicates must return a boolean synchronously.")
				decisions.set(request, selected)
			}
			return selected ? options : skipped
		},
	})
	// Chaining builder methods would bypass the conditional options accessor.
	const registration: Pick<typeof wrapped, "options" | "~types"> = wrapped
	return registration
}
