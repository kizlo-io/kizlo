import type { Settings as ApiSettings, SettingsConstants } from "@kizlo/shared"
import z from "zod"

// ====================================================
// INTERFACE
// ====================================================

export type { SettingsConstants, Variable } from "@kizlo/shared"

export interface Settings extends ApiSettings {
	constants: SettingsConstants
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
		z.string().refine((val) => val === "" || /^(\/[^\s/]+)*\/[^\s/]+\.xml$/.test(val), {
			message: "Pathname must be a valid path ending with a .xml filename (e.g. /sitemaps/index.xml)",
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

const HexColor = z
	.string()
	.regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Enter a valid hex color, e.g. #1a2b3c.")
	.nullable()

export const BrandSettingsSchema = z.object({
	logo: z.number().nullable(),
	logo_dark: z.number().nullable(),
	logo_icon: z.number().nullable(),
	logo_icon_dark: z.number().nullable(),
	logo_wordmark: z.number().nullable(),
	logo_wordmark_dark: z.number().nullable(),
	favicon: z.number().nullable(),
	favicon_dark: z.number().nullable(),
	ios_app_icon: z.number().nullable(),
	android_app_icon: z.number().nullable(),
	theme_color: HexColor,
	theme_color_dark: HexColor,
	background_color: HexColor,
})
export type BrandSettingsSchemaInput = z.input<typeof BrandSettingsSchema>
export type BrandSettingsSchemaOutput = z.output<typeof BrandSettingsSchema>

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
	brand: BrandSettingsSchemaOutput
	identity: IdentitySettingsOutput
	authors: AuthorSettingsOutput
	post_types: PostTypeSettingsOutput
	taxonomies: TaxonomySettingsOutput
	webhook: WebhookSettingsOutput
	crawling: CrawlingSettingsOutput
}
