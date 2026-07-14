// ====================================================
// KIZLO SETTINGS — CANONICAL RESPONSE CONTRACT
//
// Single source of truth for the shape returned by
// GET /kizlo/v1/settings. Shared by the server client
// (packages/kizlo) and the plugin admin (plugins/kizlo) so the
// two never drift. Mirrors the PHP SettingsModule::toResponse()
// and each section's getData() defaults 1:1 — keep them in sync.
// ====================================================

export interface Media {
	id: number
	url: string
}

export interface Variable {
	value: string
	label: string
	description: string
}

export interface SocialProfile {
	url: string
	platform: string
}

export interface SiteSettings {
	url: string | null
	backend_url: string | null
	secret: string | null
	name: string | null
	alternate_name: string | null
	tagline: string | null
	title_separator: string
	fallback_image: Media | null
	search_action_structure: string | null
	discourage_search_engines: boolean
}

export interface BrandSettings {
	logo: Media | null
	logo_dark: Media | null
	logo_icon: Media | null
	logo_icon_dark: Media | null
	logo_wordmark: Media | null
	logo_wordmark_dark: Media | null
	favicon: Media | null
	favicon_dark: Media | null
	apple_touch_icon: Media | null
}

export interface PersonSettings {
	user_id: number | null
	image: Media | null
	social_profiles: SocialProfile[]
}

export interface OrganizationFounder {
	name: string
	social_profiles: SocialProfile[]
}

export interface OrganizationSettings {
	name: string
	alternate_name: string | null
	slogan: string | null
	description: string | null
	email: string | null
	phone: string | null
	legal_name: string | null
	founding_date: string | null
	founder: OrganizationFounder | null
	employees_min: number | null
	employees_max: number | null
	logo: Media | null
	social_profiles: SocialProfile[]
	vat_id: string | null
	tax_id: string | null
	iso6523_code: string | null
	duns: string | null
	lei_code: string | null
	naics: string | null
	publishing_principles: string | null
	ownership_funding_info: string | null
	actionable_feedback_policy: string | null
	corrections_policy: string | null
	ethics_policy: string | null
	diversity_policy: string | null
	diversity_staffing_report: string | null
}

export interface IdentitySettings {
	type: "person" | "organization"
	person: PersonSettings | null
	organization: OrganizationSettings | null
}

export interface BaseContentSettings {
	title_structure: string | null
	description_structure: string | null
	search_engine_visibility: boolean | null
	webpage_type: string
	article_type: string | null
	// Ordered breadcrumb middle rows: page IDs and/or the reserved "__parent__" token.
	breadcrumbs: (string | number)[]
}

export interface AuthorsSettings extends Omit<BaseContentSettings, "webpage_type" | "article_type"> {
	enabled: boolean
	pathname_structure: string | null
}

export interface PostTypeSupports {
	title: boolean
	editor: boolean
	author: boolean
	thumbnail: boolean
	excerpt: boolean
	trackbacks: boolean
	"custom-fields": boolean
	comments: boolean
	revisions: boolean
	"page-attributes": boolean
	"post-formats": boolean
}

export interface PostTypeSettings extends BaseContentSettings {
	name: string
	slug: string
	hierarchical: boolean
	seo_enabled: boolean
	pathname_structure: string | null
	comment_action_structure: string | null
	rest_api_enabled: boolean
	internal: boolean
	publicly_queryable: boolean
	content_variables: Variable[]
	supports: PostTypeSupports
}

export interface TaxonomySettings extends Omit<BaseContentSettings, "webpage_type" | "article_type"> {
	name: string
	slug: string
	hierarchical: boolean
	seo_enabled: boolean
	pathname_structure: string | null
	rest_api_enabled: boolean
	internal: boolean
	publicly_queryable: boolean
}

export interface CrawlingSettings {
	sitemaps: {
		pathname_structure: string
	}
	robots: {
		include_sitemap: boolean
		custom_rules: {
			user_agent: string
			rule: "allow" | "disallow"
			path: string
		}[]
	}
}

export interface WebhookSettings {
	post_types: string[]
	taxonomies: string[]
	webhook_urls: string[]
}

export interface PostStatus {
	label: string
	slug: string
	public: boolean
	private: boolean
	internal: boolean
	protected: boolean
}

export interface Settings {
	site: SiteSettings
	brand: BrandSettings
	identity: IdentitySettings
	authors: AuthorsSettings
	post_types: PostTypeSettings[]
	taxonomies: TaxonomySettings[]
	crawling: CrawlingSettings
	webhook: WebhookSettings
	statuses: PostStatus[]
	plain_permalinks: boolean
}

// ====================================================
// CONSTANTS — bootstrap-only (getPluginData)
//
// Not part of the GET /settings response; the plugin admin
// injects these on window.kizlo for the editor's variable
// pickers and separator options.
// ====================================================

export interface SettingsVariableGroup {
	path_variables: Variable[]
	content_variables: Variable[]
	default_title_format: string
	default_desc_format: string
}

export interface SettingsConstants {
	site: {
		title_separators: string[]
		default_title_separator: string
	}
	taxonomy: SettingsVariableGroup
	post_type: SettingsVariableGroup
	author: SettingsVariableGroup
}
