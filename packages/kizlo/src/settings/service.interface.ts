import type {
	AuthorsSettings,
	BrandSettings,
	CrawlingSettings,
	HeadlessSettings,
	IdentitySettings,
	OrganizationSettings,
	PersonSettings,
	PostTypeSettings,
	SiteSettings,
	TaxonomySettings,
	UploadsSettings,
	WebhookSettings,
} from "@kizlo/shared"

export type { OrganizationFounder, PostStatusDefinition, Settings, SocialProfile } from "@kizlo/shared"

export type {
	AuthorsSettings,
	BrandSettings,
	CrawlingSettings,
	HeadlessSettings,
	IdentitySettings,
	OrganizationSettings,
	PersonSettings,
	PostTypeSettings,
	SiteSettings,
	TaxonomySettings,
	UploadsSettings,
	WebhookSettings,
}

export type SiteSettingsInput = Partial<Omit<SiteSettings, "fallback_image"> & { fallback_image: number | null }>

/** Every brand slot is an attachment id apart from the colours, which are written as authored. */
export type BrandSettingsInput = Partial<
	Record<keyof Omit<BrandSettings, "theme_color" | "theme_color_dark" | "background_color">, number | null> &
		Pick<BrandSettings, "theme_color" | "theme_color_dark" | "background_color">
>

export type WebhookSettingsInput = Partial<WebhookSettings>

export type PersonSettingsInput = Partial<Omit<PersonSettings, "image"> & { image: number | null }>

export type OrganizationSettingsInput = Partial<Omit<OrganizationSettings, "logo"> & { logo: number | null }>

export type IdentitySettingsInput = Partial<{
	type: IdentitySettings["type"]
	person: PersonSettingsInput
	organization: OrganizationSettingsInput
}>

export type AuthorsSettingsInput = Partial<AuthorsSettings>

export type CrawlingSettingsInput = Partial<CrawlingSettings>

export type UploadsSettingsInput = Partial<UploadsSettings>

export type HeadlessSettingsInput = Partial<HeadlessSettings>

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
		| "breadcrumbs"
	>
>
