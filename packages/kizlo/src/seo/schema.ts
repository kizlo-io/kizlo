import { NumberLike } from "@kizlo/shared"
import z from "zod/v4"

export const SeoHead = z.object({
	title: z.string(),
	canonical: z.string(),
	robots: z.object({
		index: z.string(),
		follow: z.string(),
		maxSnippet: z.string(),
		maxImagePreview: z.string(),
		maxVideoPreview: z.string(),
	}),
	og: z.object({
		locale: z.string(),
		type: z.string(),
		title: z.string(),
		url: z.string(),
		siteName: z.string(),
		description: z.string(),
		image: z
			.object({
				url: z.string(),
				width: z.string(),
				height: z.string(),
				type: z.string(),
				alt: z.string().nullable(),
			})
			.nullable(),
	}),
	twitter: z.object({
		card: z.enum(["summary", "summary_large_image"]),
		title: z.string(),
		site: z.string().nullable(),
		creator: z.string().nullable(),
		description: z.string(),
		image: z.string().nullable(),
	}),
	article: z
		.object({
			publishedTime: z.string(),
			modifiedTime: z.string(),
			author: z.string(),
			authorUrl: z.string(),
			section: z.string(),
		})
		.nullable(),
})
export type SeoHead = z.infer<typeof SeoHead>

export const SeoSchema = z.object({
	"@context": z.literal("https://schema.org"),
	"@graph": z.array(z.record(z.string(), z.unknown())),
})
export type SeoSchema = z.infer<typeof SeoSchema>

export const Seo = z.object({
	head: SeoHead,
	schema: SeoSchema,
})
export type Seo = z.infer<typeof Seo>

export const CONTENT_TYPES = ["post_type", "taxonomy", "author"] as const
export const ContentType = z.enum(CONTENT_TYPES)
export type ContentType = z.infer<typeof ContentType>

export const Sitemap = z.object({
	key: z.string(),
	type: ContentType,
	pages: z.number(),
	lastmod: z.string(),
})
export type Sitemap = z.infer<typeof Sitemap>

export const SitemapList = z.array(Sitemap)
export type SitemapList = z.infer<typeof SitemapList>

export const SitemapUrlImage = z.object({
	loc: z.string(),
	title: z.string(),
})
export type SitemapUrlImage = z.infer<typeof SitemapUrlImage>

export const SitemapUrl = z.object({
	loc: z.string(),
	lastmod: z.string(),
	images: z.array(SitemapUrlImage),
})
export type SitemapUrl = z.infer<typeof SitemapUrl>

export const SitemapUrlList = z.array(SitemapUrl)
export type SitemapUrlList = z.infer<typeof SitemapUrlList>

export const ListSitemapUrlInputBase = z.object({
	type: ContentType,
	page: NumberLike.optional(),
})
export type ListSitemapUrlInputBase = z.input<typeof ListSitemapUrlInputBase>

export const ListSitemapUrlInput = z.union([
	ListSitemapUrlInputBase.extend({
		type: ContentType.exclude(["author"]),
		key: z.string(),
	}),
	ListSitemapUrlInputBase.extend({
		type: ContentType.extract(["author"]),
	}),
])
export type ListSitemapUrlInput = z.infer<typeof ListSitemapUrlInput>

export const RobotsRule = z.object({
	userAgent: z.string(),
	allow: z.array(z.string()),
	disallow: z.array(z.string()),
})
export type RobotsRule = z.infer<typeof RobotsRule>

export const Robots = z.object({
	sitemaps: z.array(z.string()),
	rules: z.array(RobotsRule),
})
export type Robots = z.infer<typeof Robots>
