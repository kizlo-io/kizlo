import type { Variable } from "@/shared/lib/schema"

export interface SeoImage {
	id: number
	url: string | null
}

export interface SeoSocial {
	title: string
	description: string
	image: SeoImage | null
}

export interface SeoMeta {
	title: string
	description: string
	canonical: string
	webpage_type: string
	article_type: string
	noindex: boolean
	nofollow: boolean
	og: SeoSocial
	twitter: SeoSocial
}

export interface SeoDefaults {
	title: string
	description: string
	canonical: string
	indexable: boolean
	webpage_type: string
	article_type: string
	og_image: SeoImage | null
}

export interface SeoOverrides {
	title: string
	description: string
	canonical: string
	noindex: boolean
	nofollow: boolean
	webpage_type?: string
	article_type?: string
	og_title?: string
	og_description?: string
	og_image_id?: number
	twitter_title?: string
	twitter_description?: string
	twitter_image_id?: number
}

export type SeoVariant = "post" | "term"

export interface SeoTemplates {
	title: string
	description: string
	canonical: string
}

declare global {
	interface Window {
		kizloSeo: {
			meta: SeoMeta
			defaults: SeoDefaults
			variables: Variable[]
			templates?: SeoTemplates
			context?: Record<string, string>
			variant?: SeoVariant
		}
	}
}
