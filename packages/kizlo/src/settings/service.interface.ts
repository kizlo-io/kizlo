// ====================================================
// READ — GET /kizlo/v1/settings
// ====================================================

export interface KizloMedia {
	id: number
	url: string
}

export interface KizloSocialProfile {
	url: string
	platform: string
}

export interface KizloSiteSettings {
	url: string | null
	backend_url: string | null
	secret: string | null
	name: string | null
	alternate_name: string | null
	tagline: string | null
	title_separator: string
	fallback_image: KizloMedia | null
	search_action_structure: string | null
	discourage_search_engines: boolean
}

export interface KizloPersonSettings {
	name: string
	image: KizloMedia | null
	social_profiles: KizloSocialProfile[]
}

export interface KizloOrganizationFounder {
	name: string
	social_profiles: KizloSocialProfile[]
}

export interface KizloOrganizationSettings {
	name: string
	alternate_name: string | null
	slogan: string | null
	description: string | null
	email: string | null
	phone: string | null
	legal_name: string | null
	founding_date: string | null
	founder: KizloOrganizationFounder | null
	employees: number | null
	logo: KizloMedia | null
	social_profiles: KizloSocialProfile[]
}

export interface KizloIdentitySettings {
	type: "person" | "organization"
	person: KizloPersonSettings | null
	organization: KizloOrganizationSettings | null
}

interface KizloBaseContentSettings {
	title_structure: string | null
	description_structure: string | null
	search_engine_visibility: boolean | null
	webpage_type: string
	article_type: string | null
}

export interface KizloAuthorsSettings extends Omit<KizloBaseContentSettings, "webpage_type" | "article_type"> {
	enabled: boolean
	pathname_structure: string | null
}

export interface KizloPostTypeSettings extends KizloBaseContentSettings {
	name: string
	slug: string
	seo_enabled: boolean
	pathname_structure: string | null
	comment_action_structure: string | null
	rest_api_enabled: boolean
	internal: boolean
	publicly_queryable: boolean
	supports: Record<string, boolean>
}

export interface KizloTaxonomySettings extends Omit<KizloBaseContentSettings, "webpage_type" | "article_type"> {
	name: string
	slug: string
	seo_enabled: boolean
	pathname_structure: string | null
	rest_api_enabled: boolean
	internal: boolean
	publicly_queryable: boolean
}

export interface KizloWebhookSettings {
	post_types: string[]
	taxonomies: string[]
	webhook_urls: string[]
}

export interface KizloCrawlingSettings {
	sitemaps: { pathname_structure: string }
	robots: {
		include_sitemap: boolean
		custom_rules: { user_agent: string; rule: "allow" | "disallow"; path: string }[]
	}
}

export interface KizloPostStatus {
	label: string
	slug: string
	public: boolean
}

export interface KizloSettings {
	site: KizloSiteSettings
	identity: KizloIdentitySettings
	authors: KizloAuthorsSettings
	post_types: KizloPostTypeSettings[]
	taxonomies: KizloTaxonomySettings[]
	crawling: KizloCrawlingSettings
	webhook: KizloWebhookSettings
	statuses: KizloPostStatus[]
	plain_permalinks: boolean
}

// ====================================================
// WRITE — PUT /kizlo/v1/settings/<section>
//
// Every field is optional; only the keys you send are changed. Media fields
// take an attachment id (number) rather than the resolved media object.
// ====================================================

export type KizloSiteSettingsInput = Partial<Omit<KizloSiteSettings, "fallback_image"> & { fallback_image: number | null }>

export type KizloWebhookSettingsInput = Partial<KizloWebhookSettings>

export type KizloPersonSettingsInput = Partial<Omit<KizloPersonSettings, "image"> & { image: number | null }>

export type KizloOrganizationSettingsInput = Partial<Omit<KizloOrganizationSettings, "logo"> & { logo: number | null }>

export type KizloIdentitySettingsInput = Partial<{
	type: "person" | "organization"
	person: KizloPersonSettingsInput | null
	organization: KizloOrganizationSettingsInput | null
}>

export type KizloAuthorsSettingsInput = Partial<KizloAuthorsSettings>

export type KizloCrawlingSettingsInput = Partial<KizloCrawlingSettings>

export type KizloPostTypeSettingsInput = Partial<
	Pick<
		KizloPostTypeSettings,
		| "title_structure"
		| "description_structure"
		| "search_engine_visibility"
		| "webpage_type"
		| "article_type"
		| "seo_enabled"
		| "pathname_structure"
		| "comment_action_structure"
		| "rest_api_enabled"
		| "publicly_queryable"
	>
>

export type KizloTaxonomySettingsInput = Partial<
	Pick<
		KizloTaxonomySettings,
		| "title_structure"
		| "description_structure"
		| "search_engine_visibility"
		| "seo_enabled"
		| "pathname_structure"
		| "rest_api_enabled"
		| "publicly_queryable"
	>
>
