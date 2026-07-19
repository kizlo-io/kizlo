import { expect, test } from "vitest"
import { ListSitemapUrlInput, Seo } from "./schema"
import type { WPK_Seo } from "./types"
import { deserializeSeo } from "./utils"

/** The shape the plugin emits for a page with no optional SEO data populated. */
function minimalSeo(): WPK_Seo {
	return {
		head: {
			title: "Home",
			canonical: "https://example.com/",
			robots: {
				index: "index",
				follow: "follow",
				"max-snippet": "max-snippet:-1",
				"max-image-preview": "max-image-preview:large",
				"max-video-preview": "max-video-preview:-1",
			},
			og: { locale: "en_US", type: "website", title: "Home", url: "https://example.com/", site_name: "Example" },
			twitter: { card: "summary", title: "Home", site: null, creator: null },
			article: null,
		},
		schema: { "@context": "https://schema.org", "@graph": [] },
	}
}

test("deserializeSeo coalesces the fields the plugin omits when empty", () => {
	const result = deserializeSeo(minimalSeo())

	expect(result.head.og.description).toBe("")
	expect(result.head.og.image).toBeNull()
	expect(result.head.twitter.description).toBe("")
	expect(result.head.twitter.image).toBeNull()
	expect(result.head.twitter.imageAlt).toBeNull()
	expect(result.head.article).toBeNull()
})

test("deserializeSeo output for an empty page passes schema validation", () => {
	// Regression: the plugin omits optional keys, which used to surface as `undefined`
	// against required string fields and fail output validation with a 500.
	expect(() => Seo.parse(deserializeSeo(minimalSeo()))).not.toThrow()
})

test("deserializeSeo preserves numeric og image dimensions and passes schema", () => {
	const data = minimalSeo()
	data.head.og.image = { url: "https://example.com/i.jpg", width: 1200, height: 630, type: "image/jpeg", alt: "Alt" }

	const result = deserializeSeo(data)

	expect(result.head.og.image).toEqual({ url: "https://example.com/i.jpg", width: 1200, height: 630, type: "image/jpeg", alt: "Alt" })
	expect(() => Seo.parse(result)).not.toThrow()
})

test("deserializeSeo tolerates a null og image mime type", () => {
	const data = minimalSeo()
	data.head.og.image = { url: "https://example.com/i.jpg", width: null, height: null, type: null, alt: null }

	expect(() => Seo.parse(deserializeSeo(data))).not.toThrow()
})

test("deserializeSeo maps twitter imageAlt and article tags", () => {
	const data = minimalSeo()
	data.head.twitter = {
		card: "summary_large_image",
		title: "Home",
		site: "@acme",
		creator: "@acme",
		description: "A description.",
		image: "https://example.com/i.jpg",
		image_alt: "Alt text",
	}
	data.head.article = {
		published_time: "2026-01-01T00:00:00+00:00",
		modified_time: "2026-01-02T00:00:00+00:00",
		author: "Ada",
		author_url: "https://example.com/author/ada/",
		section: "Science",
		tags: ["alpha", "beta"],
	}

	const result = deserializeSeo(data)

	expect(result.head.twitter.imageAlt).toBe("Alt text")
	expect(result.head.article?.tags).toEqual(["alpha", "beta"])
	expect(() => Seo.parse(result)).not.toThrow()
})

test("deserializeSeo coalesces a partially populated article block", () => {
	const data = minimalSeo()
	// The plugin omits each article field individually when empty.
	data.head.article = { published_time: "2026-01-01T00:00:00+00:00" }

	const result = deserializeSeo(data)

	expect(result.head.article).toEqual({
		publishedTime: "2026-01-01T00:00:00+00:00",
		modifiedTime: "",
		author: "",
		authorUrl: "",
		section: "",
		tags: [],
	})
	expect(() => Seo.parse(result)).not.toThrow()
})

test("ListSitemapUrlInput requires a key for keyed types but not for author", () => {
	expect(ListSitemapUrlInput.parse({ type: "author" })).toEqual({ type: "author" })
	expect(ListSitemapUrlInput.parse({ type: "post_type", key: "post" })).toEqual({ type: "post_type", key: "post" })
	expect(() => ListSitemapUrlInput.parse({ type: "post_type" })).toThrow()
})

test("ListSitemapUrlInput coerces the page query string", () => {
	expect(ListSitemapUrlInput.parse({ type: "author", page: "2" })).toEqual({ type: "author", page: 2 })
})
