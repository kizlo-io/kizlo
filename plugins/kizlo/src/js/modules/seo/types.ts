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

export type SeoVariant = "post" | "term"

// Raw title/description templates for the current context, so the preview can
// re-resolve them live instead of using the server-frozen `defaults`.
export interface SeoTemplates {
	title: string
	description: string
	// Full canonical URL with path tokens (e.g. {{slug}}) left in, so the preview
	// URL can be rebuilt live from the editor's slug.
	canonical: string
}

declare global {
	interface Window {
		kizloSeo: {
			meta: SeoMeta
			defaults: SeoDefaults
			variables: Variable[]
			// Post editor only; absent for the term meta box, which keeps the
			// frozen `defaults`.
			templates?: SeoTemplates
			// Server-resolved token -> value baseline. The editor overlays live
			// values on top for the fields an author can edit.
			context?: Record<string, string>
			// Absent on the post editor (defaults to "post"); "term" hides the
			// schema-type/article fields that don't apply to taxonomy terms.
			variant?: SeoVariant
		}
	}
}
