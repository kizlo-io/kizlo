import type {
	AuthorsSettings,
	BrandSettings,
	CrawlingSettings,
	IdentitySettings,
	OrganizationSettings,
	PersonSettings,
	PostTypeSettings,
	SiteSettings,
	TaxonomySettings,
	WebhookSettings,
} from "@kizlo/shared"

export type { OrganizationFounder, PostStatusDefinition, Settings, SocialProfile } from "@kizlo/shared"

export type {
	AuthorsSettings,
	BrandSettings,
	CrawlingSettings,
	IdentitySettings,
	OrganizationSettings,
	PersonSettings,
	PostTypeSettings,
	SiteSettings,
	TaxonomySettings,
	WebhookSettings,
}

export type SiteSettingsInput = Partial<Omit<SiteSettings, "fallback_image"> & { fallback_image: number | null }>

export type BrandSettingsInput = Partial<Record<keyof BrandSettings, number | null>>

export type WebhookSettingsInput = Partial<WebhookSettings>

export type PersonSettingsInput = Partial<Omit<PersonSettings, "image"> & { image: number | null }>

export type OrganizationSettingsInput = Partial<Omit<OrganizationSettings, "logo"> & { logo: number | null }>

export type IdentitySettingsInput = Partial<{
	type: IdentitySettings["type"]
	person: PersonSettingsInput | null
	organization: OrganizationSettingsInput | null
}>

export type AuthorsSettingsInput = Partial<AuthorsSettings>

export type CrawlingSettingsInput = Partial<CrawlingSettings>

export type PostTypeSettingsInput = Partial<
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

export type TaxonomySettingsInput = Partial<
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
