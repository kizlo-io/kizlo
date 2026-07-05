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

// The flat shape serialized into the meta box's hidden input and read on
// save(). Empty/default values are omitted before serialization.
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

declare global {
	interface Window {
		kizloSeo: {
			meta: SeoMeta
			defaults: SeoDefaults
			variables: Variable[]
		}
	}
}
