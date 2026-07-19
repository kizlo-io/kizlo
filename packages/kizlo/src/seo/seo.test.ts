import { beforeAll, expect, test } from "vitest"
import { getKizloTestInstance, type KizloTestInstance } from "../test"
import { Robots, Seo, SitemapIndex, SitemapList, SitemapUrlList } from "./schema"

let kizlo: KizloTestInstance

beforeAll(() => {
	kizlo = getKizloTestInstance()
})

test("seo.homepage returns head + schema conforming to Seo", async () => {
	const result = await kizlo.client.seo.homepage.call()
	expect(Seo.safeParse(result).success).toBe(true)
	expect(result.head.title.length).toBeGreaterThan(0)
	expect(result.schema["@context"]).toBe("https://schema.org")
})

test("seo.robots returns rules and sitemaps conforming to Robots", async () => {
	const result = await kizlo.client.seo.robots.call()
	expect(Robots.safeParse(result).success).toBe(true)
	expect(Array.isArray(result.rules)).toBe(true)
	expect(Array.isArray(result.sitemaps)).toBe(true)
})

test("seo.sitemaps.index returns an origin and entries conforming to SitemapIndex", async () => {
	const result = await kizlo.client.seo.sitemaps.index.call()
	expect(SitemapIndex.safeParse(result).success).toBe(true)
	expect(result.origin.length).toBeGreaterThan(0)
})

test("seo.sitemaps.list returns entries conforming to SitemapList", async () => {
	const result = await kizlo.client.seo.sitemaps.list.call()
	expect(SitemapList.safeParse(result).success).toBe(true)
	expect(result.length).toBeGreaterThan(0)
})

test("seo.urls returns urls for a listed sitemap conforming to SitemapUrlList", async () => {
	const sitemaps = await kizlo.client.seo.sitemaps.list.call()
	const entry = sitemaps[0]
	if (!entry) throw new Error("no sitemaps available in the seeded stack")

	const result = await kizlo.client.seo.urls.call(
		entry.type === "author" ? { type: "author", page: 1 } : { type: entry.type, key: entry.key, page: 1 },
	)
	expect(SitemapUrlList.safeParse(result).success).toBe(true)
	expect(result.length).toBeGreaterThan(0)
	expect(result[0]?.loc.length).toBeGreaterThan(0)
})
