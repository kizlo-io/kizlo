import z from "zod"

// ====================================================
// INTERFACE
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

export interface PostTypeSettings extends BaseContentSettings {
	name: string
	slug: string
	seo_enabled: boolean
	pathname_structure: string | null
	comment_action_structure: string | null
	rest_api_enabled: boolean
	internal: boolean
	publicly_queryable: boolean
	supports: {
		title: boolean
		editor: boolean
		author: boolean
		thumbnail: boolean
		excerpt: boolean
		trackbacks: boolean
		"custom-fields": boolean
		comments: boolean
		revisions: boolean
		"page-attributes": false
		"post-formats": boolean
	}
}

export interface TaxonomySettings extends Omit<BaseContentSettings, "webpage_type" | "article_type"> {
	name: string
	slug: string
	seo_enabled: boolean
	pathname_structure: string | null
	rest_api_enabled: boolean
	internal: boolean
	publicly_queryable: boolean
}

export interface IdentitySettings {
	type: "person" | "organization"
	person: PersonSettings | null
	organization: OrganizationSettings | null
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

export interface Settings {
	site: SiteSettings
	identity: IdentitySettings
	authors: AuthorsSettings
	post_types: PostTypeSettings[]
	taxonomies: TaxonomySettings[]
	webhook: WebhookSettings
	crawling: CrawlingSettings
	post_statuses: { label: string; slug: string; public: boolean }[]
	constants: {
		site: {
			title_separators: string[]
			default_title_separator: string
		}
		taxonomy: {
			path_variables: Variable[]
			content_variables: Variable[]
			default_title_format: string
			default_desc_format: string
		}
		post_type: {
			path_variables: Variable[]
			content_variables: Variable[]
			default_title_format: string
			default_desc_format: string
		}
		author: {
			path_variables: Variable[]
			content_variables: Variable[]
			default_title_format: string
			default_desc_format: string
		}
	}
}

// ====================================================
// GENERAL SCHEMA
// ====================================================

export const NulledUrlSchema: z.ZodType<string | null, string> = z
	.preprocess((val) => val ?? "", z.union([z.literal(""), z.url()]))
	.transform((val) => (val === "" ? null : val)) as never

export function createNulledPathnameStructureSchema(requiredVar?: string): z.ZodType<string | null, string> {
	return z
		.string()
		.transform((val) => val ?? "")
		.superRefine((val, ctx) => {
			if (val === "") return

			if (!val.startsWith("/")) {
				ctx.addIssue({
					code: "custom",
					message: "Must start with /",
				})
			}

			if (requiredVar && !val.includes(requiredVar)) {
				ctx.addIssue({
					code: "custom",
					message: `Path must include ${requiredVar}`,
				})
			}
		})
		.transform((val) => (val === "" ? null : val)) as never
}

export const NulledEmailSchema: z.ZodType<string | null, string> = z
	.preprocess((val) => val ?? "", z.union([z.literal(""), z.email()]))
	.transform((val) => (val === "" ? null : val)) as never

export const NulledStringSchema: z.ZodType<string | null, string> = z
	.preprocess((val) => val ?? "", z.string())
	.transform((val) => (val === "" ? null : val)) as never

export const NulledSitemapPathSchema: z.ZodType<string | null, string> = z
	.preprocess(
		(val) => val ?? "",
		z.string().refine((val) => val === "" || /^(\/[^\s/]+)*\/[^\s/]+_index\.xml$/.test(val), {
			message: "Pathname must be a valid path ending with a _index.xml filename (e.g. /sitemap_index.xml)",
		}),
	)
	.transform((val) => (val === "" ? null : val)) as never

export const SocialProfileSchema = z.object({
	url: z.url("Enter a valid URL."),
	platform: z.string().min(1, "Platform name is required."),
})
export type SocialProfileSchema = z.infer<typeof SocialProfileSchema>

export const SiteSettingsSchema = z.object({
	url: NulledUrlSchema,
	backend_url: NulledUrlSchema,
	secret: NulledStringSchema,
	name: NulledStringSchema,
	alternate_name: NulledStringSchema,
	tagline: NulledStringSchema,
	title_separator: z.string(),
	fallback_image: z.number().nullable(),
	search_action_structure: createNulledPathnameStructureSchema("{{search_term_string}}"),
	discourage_search_engines: z.boolean(),
})
export type SiteSettingsSchemaInput = z.input<typeof SiteSettingsSchema>
export type SiteSettingsSchemaOutput = z.output<typeof SiteSettingsSchema>

// A user is required once the site represents a person: the person node, its
// @id, the publisher, `about`, and the author-merge all key off it. An empty
// combobox value fails validation rather than saving a person identity with no
// user behind it.
export const RequiredUserSchema: z.ZodType<number, string> = z.preprocess(
	(val) => (val === "" || val == null ? undefined : Number(val)),
	z.number({ error: "Select a user to represent this site." }).int().positive(),
) as never

export const PersonSettingsSchema = z.object({
	user_id: RequiredUserSchema,
	image: z.number().nullable(),
	social_profiles: z.array(SocialProfileSchema),
})
export type PersonSettingsSchema = z.infer<typeof PersonSettingsSchema>

export const OrganizationFounderSchema = z.object({
	name: z.string().min(1, "Name is required"),
	social_profiles: z.array(SocialProfileSchema),
})
export type OrganizationFounderSchema = z.infer<typeof OrganizationFounderSchema>

export const OrganizationSettingsSchema = z.object({
	name: z.string().min(1, "Name is required"),
	alternate_name: NulledStringSchema,
	slogan: NulledStringSchema,
	description: NulledStringSchema,
	email: NulledEmailSchema,
	phone: NulledStringSchema,
	legal_name: NulledStringSchema,
	founding_date: NulledStringSchema,
	founder: OrganizationFounderSchema,
	employees_min: z.coerce.number().nonnegative().int(),
	employees_max: z.coerce.number().nonnegative().int(),
	logo: z.number().nullable(),
	social_profiles: z.array(SocialProfileSchema),
	vat_id: NulledStringSchema,
	tax_id: NulledStringSchema,
	iso6523_code: NulledStringSchema,
	duns: NulledStringSchema,
	lei_code: NulledStringSchema,
	naics: NulledStringSchema,
	publishing_principles: NulledUrlSchema,
	ownership_funding_info: NulledUrlSchema,
	actionable_feedback_policy: NulledUrlSchema,
	corrections_policy: NulledUrlSchema,
	ethics_policy: NulledUrlSchema,
	diversity_policy: NulledUrlSchema,
	diversity_staffing_report: NulledUrlSchema,
})
export type OrganizationSettingsSchema = z.infer<typeof OrganizationSettingsSchema>

export const IdentitySettingsSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("person"),
		person: PersonSettingsSchema,
	}),
	z.object({
		type: z.literal("organization"),
		organization: OrganizationSettingsSchema,
	}),
])
export type IdentitySettingsInput = z.input<typeof IdentitySettingsSchema>
export type IdentitySettingsOutput = z.output<typeof IdentitySettingsSchema>

// ====================================================
// AUTHORS
// ====================================================

export const AuthorSettingsSchema = z.object({
	enabled: z.boolean(),
	pathname_structure: createNulledPathnameStructureSchema("{{slug}}"),
	title_structure: NulledStringSchema,
	description_structure: NulledStringSchema,
	search_engine_visibility: z.boolean(),
	breadcrumbs: z.array(z.string()),
})
export type AuthorSettingsInput = z.input<typeof AuthorSettingsSchema>
export type AuthorSettingsOutput = z.output<typeof AuthorSettingsSchema>

// ====================================================
// CRAWLING
// ====================================================

export const CrawlingSettingsSchema = z.object({
	sitemaps: z.object({
		pathname_structure: NulledSitemapPathSchema,
	}),
	robots: z.object({
		include_sitemap: z.boolean(),
		custom_rules: z.array(
			z.object({
				user_agent: z.string().min(1, "User agent is required"),
				rule: z.enum(["allow", "disallow"]),
				path: z.string().min(1, "Path is required"),
			}),
		),
	}),
})
export type CrawlingSettingsInput = z.input<typeof CrawlingSettingsSchema>
export type CrawlingSettingsOutput = z.output<typeof CrawlingSettingsSchema>

// ====================================================
// POST TYPE SCHEMA
// ====================================================

export const PostTypeSettingsSchema = z.object({
	pathname_structure: createNulledPathnameStructureSchema("{{slug}}"),
	title_structure: NulledStringSchema,
	description_structure: NulledStringSchema,
	search_engine_visibility: z.boolean(),
	webpage_type: z.string().min(1, "Webpage type is required."),
	article_type: NulledStringSchema,
	comment_action_structure: createNulledPathnameStructureSchema(),
	seo_enabled: z.boolean(),
	rest_api_enabled: z.boolean(),
	breadcrumbs: z.array(z.string()),
})
export type PostTypeSettingsInput = z.input<typeof PostTypeSettingsSchema>
export type PostTypeSettingsOutput = z.output<typeof PostTypeSettingsSchema>

export const TaxonomySettingsSchema = z.object({
	pathname_structure: createNulledPathnameStructureSchema("{{slug}}"),
	title_structure: NulledStringSchema,
	description_structure: NulledStringSchema,
	search_engine_visibility: z.boolean(),
	seo_enabled: z.boolean(),
	rest_api_enabled: z.boolean(),
	breadcrumbs: z.array(z.string()),
})
export type TaxonomySettingsInput = z.input<typeof TaxonomySettingsSchema>
export type TaxonomySettingsOutput = z.output<typeof TaxonomySettingsSchema>

// ====================================================
// INTEGRATION SCHEMA
// ====================================================

export const WebhookSettingsSchema = z.object({
	post_types: z.array(z.string()),
	taxonomies: z.array(z.string()),
	webhook_urls: z.array(z.url()),
})
export type WebhookSettingsInput = z.input<typeof WebhookSettingsSchema>
export type WebhookSettingsOutput = z.output<typeof WebhookSettingsSchema>

export interface SettingsMap {
	site: SiteSettingsSchemaOutput
	identity: IdentitySettingsOutput
	authors: AuthorSettingsOutput
	post_types: PostTypeSettingsOutput
	taxonomies: TaxonomySettingsOutput
	webhook: WebhookSettingsOutput
	crawling: CrawlingSettingsOutput
}
