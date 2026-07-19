export interface WPK_Seo {
	head: {
		title: string
		canonical: string
		robots: {
			index: string
			follow: string
			"max-snippet": string
			"max-image-preview": string
			"max-video-preview": string
		}
		og: {
			locale: string
			type: string
			title: string
			url: string
			site_name: string
			description?: string
			image?: {
				url: string
				width: number | null
				height: number | null
				type: string | null
				alt: string | null
			}
		}
		twitter: {
			card: "summary" | "summary_large_image"
			title: string
			site: string | null
			creator: string | null
			description?: string
			image?: string
			image_alt?: string
		}
		article: {
			published_time?: string
			modified_time?: string
			author?: string
			author_url?: string
			section?: string
			tags?: string[]
		} | null
	}
	schema: {
		"@context": "https://schema.org"
		"@graph": Record<string, unknown>[]
	}
}

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
