import { expect, test, vi } from "vitest"
import { Kizlo } from "../kizlo"

/**
 * What an introspection document looks like once an admin switches off API access for `post`:
 * every other managed type is still described, and the one Kizlo's own procedures call is gone.
 */
const ENDPOINTS = { postTypes: { page: {}, attachment: {} }, taxonomies: { category: {}, postTag: {} } }

function kizlo() {
	return new Kizlo({
		baseUrl: "https://app.example",
		siteSecret: "site-secret",
		credentials: { url: "https://wp.example", username: "admin", password: "secret" },
		wordpressEndpoints: ENDPOINTS,
	})
}

test("posts.list answers 404 rather than 500 when the document has no post type", async () => {
	const fetch = vi.fn()
	vi.stubGlobal("fetch", fetch)

	const result = await kizlo().client.posts.list({ query: {} })

	expect(result.success).toBe(false)
	if (result.success) throw new Error("unreachable")
	expect(result.error.code).toBe("POST_NOT_FOUND")
	expect(result.error.status).toBe(404)
	// The endpoint is what carries the path, so an absent one has nowhere to send.
	expect(fetch).not.toHaveBeenCalled()

	vi.unstubAllGlobals()
})

test("posts.get answers 404 the same way", async () => {
	const result = await kizlo().client.posts.get({ params: { identifier: "hello-world" } })

	expect(result.success).toBe(false)
	if (result.success) throw new Error("unreachable")
	expect(result.error.code).toBe("POST_NOT_FOUND")
})
