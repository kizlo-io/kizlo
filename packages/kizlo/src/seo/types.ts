import type { WP_EndpointData } from "../wordpress"

/** The resolved SEO block, exactly as the project's generated WordPress client describes it. */
export type WPK_Seo = WP_EndpointData<"seo.homepage.retrieve">

export type WPK_SitemapContentType = "post_type" | "taxonomy" | "author"

export interface WPK_RobotRule {
	user_agent: string
	allow: string[]
	disallow: string[]
}

export interface WPK_Robots {
	rules: WPK_RobotRule[]
	sitemaps?: string[]
}

export interface WPK_Sitemap {
	key: string
	type: WPK_SitemapContentType
	pages: number
	lastmod: string
}

export interface WPK_SitemapIndex {
	origin: string
	sitemaps: WPK_Sitemap[]
}

export interface WPK_SitemapUrlImage {
	loc: string
	title: string
}

export interface WPK_SitemapUrl {
	loc: string
	lastmod: string
	images: WPK_SitemapUrlImage[]
}
