import { expect, test } from "vitest"
import type { WPK_Comment } from "./types"
import { deserializeComment } from "./utils"

/**
 * WordPress emits `date` in the site's timezone and `date_gmt` in UTC, both without a designator.
 * The two differ here so a deserializer reading the wrong one cannot accidentally pass.
 */
function comment(overrides: Record<string, unknown> = {}): WPK_Comment {
	return {
		id: 1,
		parent: 0,
		status: "approved",
		content: { rendered: "<p>Body.</p>" },
		date: "2024-01-01T17:00:00",
		date_gmt: "2024-01-01T12:00:00",
		kizlo: {
			author: null,
			reply_count: 0,
			post: { id: 9, slug: "hello", title: "Hello", featured_image: null },
		},
		...overrides,
	} as WPK_Comment
}

test("postedAt reads the UTC field, not the site-local one", () => {
	expect(deserializeComment(comment())?.postedAt).toBe(Date.UTC(2024, 0, 1, 12, 0, 0))
})

test("postedAt is the same epoch whatever timezone the host runs in", () => {
	const original = process.env.TZ
	const readIn = (tz: string): number | undefined => {
		process.env.TZ = tz
		return deserializeComment(comment())?.postedAt
	}

	try {
		expect(readIn("Asia/Kolkata")).toBe(Date.UTC(2024, 0, 1, 12, 0, 0))
		expect(readIn("America/Los_Angeles")).toBe(Date.UTC(2024, 0, 1, 12, 0, 0))
	} finally {
		process.env.TZ = original
	}
})

test("an absent date resolves to 0 rather than NaN", () => {
	expect(deserializeComment(comment({ date_gmt: null }))?.postedAt).toBe(0)
})
