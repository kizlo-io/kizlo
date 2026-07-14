// ====================================================
// READ — GET /kizlo/v1/settings
//
// The response shape is defined once in @kizlo/shared and
// re-exported here under the server client's Kizlo* names so the
// plugin admin and this client can never drift apart. Do not
// redeclare these shapes locally.
// ====================================================

import type {
	AuthorsSettings,
	BrandSettings,
	CrawlingSettings,
	IdentitySettings,
	Media,
	OrganizationFounder,
	OrganizationSettings,
	PersonSettings,
	PostStatus,
	PostTypeSettings,
	Settings,
	SiteSettings,
	SocialProfile,
	TaxonomySettings,
	WebhookSettings,
} from "@kizlo/shared"

export type {
	AuthorsSettings as KizloAuthorsSettings,
	BrandSettings as KizloBrandSettings,
	CrawlingSettings as KizloCrawlingSettings,
	IdentitySettings as KizloIdentitySettings,
	Media as KizloMedia,
	OrganizationFounder as KizloOrganizationFounder,
	OrganizationSettings as KizloOrganizationSettings,
	PersonSettings as KizloPersonSettings,
	PostStatus as KizloPostStatus,
	PostTypeSettings as KizloPostTypeSettings,
	Settings as KizloSettings,
	SiteSettings as KizloSiteSettings,
	SocialProfile as KizloSocialProfile,
	TaxonomySettings as KizloTaxonomySettings,
	WebhookSettings as KizloWebhookSettings,
}

// ====================================================
// WRITE — PUT /kizlo/v1/settings/<section>
//
// Every field is optional; only the keys you send are changed. Media fields
// take an attachment id (number) rather than the resolved media object.
// ====================================================

export type KizloSiteSettingsInput = Partial<Omit<SiteSettings, "fallback_image"> & { fallback_image: number | null }>

export type KizloBrandSettingsInput = Partial<Record<keyof BrandSettings, number | null>>

export type KizloWebhookSettingsInput = Partial<WebhookSettings>

export type KizloPersonSettingsInput = Partial<Omit<PersonSettings, "image"> & { image: number | null }>

export type KizloOrganizationSettingsInput = Partial<Omit<OrganizationSettings, "logo"> & { logo: number | null }>

export type KizloIdentitySettingsInput = Partial<{
	type: IdentitySettings["type"]
	person: KizloPersonSettingsInput | null
	organization: KizloOrganizationSettingsInput | null
}>

export type KizloAuthorsSettingsInput = Partial<AuthorsSettings>

export type KizloCrawlingSettingsInput = Partial<CrawlingSettings>

export type KizloPostTypeSettingsInput = Partial<
	Pick<
		PostTypeSettings,
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
		| "breadcrumbs"
	>
>

export type KizloTaxonomySettingsInput = Partial<
	Pick<
		TaxonomySettings,
		| "title_structure"
		| "description_structure"
		| "search_engine_visibility"
		| "seo_enabled"
		| "pathname_structure"
		| "rest_api_enabled"
		| "publicly_queryable"
		| "breadcrumbs"
	>
>
