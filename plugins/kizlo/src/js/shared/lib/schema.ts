import type { Settings as ApiSettings, CustomFieldDefinition, SettingsConstants } from "@kizlo/shared"
import z from "zod"
import type { NavBlock } from "./types"

// ====================================================
// INTERFACE
// ====================================================

export type { SettingsConstants, Variable } from "@kizlo/shared"

export interface Settings extends ApiSettings {
	constants: SettingsConstants
	/** Admin-only settings navigation tree, built server-side by SettingsNav. */
	nav: NavBlock[]
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
	app_icon: z.number().nullable(),
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
// CUSTOM FIELDS
// ====================================================

/**
 * Definitions are edited structurally by the field builder and re-validated on the
 * server (name-locking, key length, safe type changes), so the client schema only
 * carries the type through — it never re-implements that server-side contract. The
 * client-side checks are field-name validity (see {@link refineFieldNames}) and
 * reserved top-level names (see {@link refineReservedNames}), both applied through the
 * settings-schema factories below.
 */
export const CustomFieldsSchema = z.array(z.custom<CustomFieldDefinition>())
export type CustomFieldsSchema = z.infer<typeof CustomFieldsSchema>

/**
 * Reduce a name to its stored meta-key segment, mirroring PHP's
 * FieldDefinitions::normalizeName (lowercase, non `[a-z0-9_]` runs to `_`, trim `_`).
 * A name that reduces to "" is silently dropped by the server on save.
 */
function normalizeFieldName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, "_")
		.replace(/^_+|_+$/g, "")
}

/**
 * A valid name is an identifier: a leading letter followed by letters, digits, or
 * underscores. Mirrors CustomFieldsValidator::NAME_PATTERN. Names surface as REST
 * response keys / object properties, so a digit-leading name like `123123` is only
 * reachable via bracket access and is rejected.
 */
const FIELD_NAME_PATTERN = /^[a-z][a-z0-9_]*$/

/**
 * Validate every field name (including nested group/repeater children). An empty
 * name is silently dropped by the server, making the whole field card vanish on save;
 * a digit-leading name saves but becomes bracket-only. Catching both here keeps the
 * card and points the error at the offending Name input.
 */
function refineFieldNames(fields: CustomFieldDefinition[], ctx: z.RefinementCtx, path: (string | number)[] = ["custom_fields"]): void {
	fields.forEach((field, index) => {
		const fieldPath = [...path, index]
		const normalized = normalizeFieldName(field.name ?? "")

		if (normalized === "") {
			ctx.addIssue({
				code: "custom",
				path: [...fieldPath, "name"],
				message: "Name is required and must include letters or numbers.",
			})
		} else if (!FIELD_NAME_PATTERN.test(normalized)) {
			ctx.addIssue({
				code: "custom",
				path: [...fieldPath, "name"],
				message: "Name must start with a letter.",
			})
		}

		if ((field.type === "group" || field.type === "repeater") && Array.isArray(field.fields)) {
			refineFieldNames(field.fields, ctx, [...fieldPath, "fields"])
		}
	})
}

/**
 * Flag any top-level custom-field name that collides with a reserved response key.
 * The reserved list is delivered per object type via the settings bootstrap
 * (`constants.post_type` / `constants.taxonomy`); PHP remains the authoritative gate.
 * Nested (group/repeater) children are namespaced under their parent, so only the
 * top level is checked. The issue path targets the offending field's Name input.
 */
function refineReservedNames(fields: CustomFieldDefinition[], reserved: Set<string>, ctx: z.RefinementCtx): void {
	fields.forEach((field, index) => {
		if (reserved.has(field.name)) {
			ctx.addIssue({
				code: "custom",
				path: ["custom_fields", index, "name"],
				message: `"${field.name}" is a reserved field name and would collide with an existing response field.`,
			})
		}
	})
}

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
	custom_fields: CustomFieldsSchema,
})
export type PostTypeSettingsInput = z.input<typeof PostTypeSettingsSchema>
export type PostTypeSettingsOutput = z.output<typeof PostTypeSettingsSchema>

/** Post-type settings schema that requires field names and rejects reserved top-level ones. */
export function createPostTypeSettingsSchema(reservedFieldNames: Iterable<string>) {
	const reserved = new Set(reservedFieldNames)
	return PostTypeSettingsSchema.superRefine((val, ctx) => {
		refineFieldNames(val.custom_fields, ctx)
		refineReservedNames(val.custom_fields, reserved, ctx)
	})
}

export const TaxonomySettingsSchema = z.object({
	pathname_structure: createNulledPathnameStructureSchema("{{slug}}"),
	title_structure: NulledStringSchema,
	description_structure: NulledStringSchema,
	search_engine_visibility: z.boolean(),
	seo_enabled: z.boolean(),
	rest_api_enabled: z.boolean(),
	breadcrumbs: z.array(z.string()),
	custom_fields: CustomFieldsSchema,
})
export type TaxonomySettingsInput = z.input<typeof TaxonomySettingsSchema>
export type TaxonomySettingsOutput = z.output<typeof TaxonomySettingsSchema>

/** Taxonomy settings schema that requires field names and rejects reserved top-level ones. */
export function createTaxonomySettingsSchema(reservedFieldNames: Iterable<string>) {
	const reserved = new Set(reservedFieldNames)
	return TaxonomySettingsSchema.superRefine((val, ctx) => {
		refineFieldNames(val.custom_fields, ctx)
		refineReservedNames(val.custom_fields, reserved, ctx)
	})
}

// ====================================================
// REGISTRATION SCHEMA
// ====================================================

/** Nullable integer from a number/text input; blank clears to null. */
const RegNullableNumberSchema: z.ZodType<number | null, number | string | null> = z.preprocess(
	(val) => (val === "" || val === null || val === undefined ? null : Number(val)),
	z.number().int().nullable(),
) as never

/** Label overrides keyed by WordPress label name; blanks fall back to generated labels. */
export const RegistrationLabelsSchema = z.record(z.string(), z.string())

function createRegistrationKeySchema(maxLength: number) {
	return z
		.string()
		.min(1, "A key is required.")
		.max(maxLength, `Key must be at most ${maxLength} characters.`)
		.regex(/^[a-z][a-z0-9_-]*$/, "Use lowercase letters, numbers, hyphens, and underscores; start with a letter.")
}

export const PostTypeRegistrationSchema = z.object({
	active: z.boolean(),
	singular_label: z.string().min(1, "A singular label is required."),
	plural_label: z.string().min(1, "A plural label is required."),
	description: z.string(),
	public: z.boolean(),
	hierarchical: z.boolean(),
	labels: RegistrationLabelsSchema,
	taxonomies: z.array(z.string()),
	supports: z.array(z.string()),
	show_ui: z.boolean(),
	show_in_menu: z.boolean(),
	menu_parent: NulledStringSchema,
	menu_position: RegNullableNumberSchema,
	menu_icon: NulledStringSchema,
	show_in_admin_bar: z.boolean(),
	show_in_nav_menus: z.boolean(),
	exclude_from_search: z.boolean(),
	publicly_queryable: z.boolean(),
	capability_type: z.enum(["post", "page", "custom"]),
	capability_singular: NulledStringSchema,
	capability_plural: NulledStringSchema,
	can_export: z.boolean(),
	delete_with_user: z.boolean(),
})
export type PostTypeRegistrationInput = z.input<typeof PostTypeRegistrationSchema>
export type PostTypeRegistrationOutput = z.output<typeof PostTypeRegistrationSchema>

export const CreatePostTypeRegistrationSchema = PostTypeRegistrationSchema.extend({
	key: createRegistrationKeySchema(20),
})
export type CreatePostTypeRegistrationInput = z.input<typeof CreatePostTypeRegistrationSchema>
export type CreatePostTypeRegistrationOutput = z.output<typeof CreatePostTypeRegistrationSchema>

export const TaxonomyRegistrationSchema = z.object({
	active: z.boolean(),
	singular_label: z.string().min(1, "A singular label is required."),
	plural_label: z.string().min(1, "A plural label is required."),
	description: z.string(),
	public: z.boolean(),
	hierarchical: z.boolean(),
	labels: RegistrationLabelsSchema,
	object_types: z.array(z.string()),
	sort: z.boolean(),
	default_term_name: NulledStringSchema,
	default_term_slug: NulledStringSchema,
	default_term_description: NulledStringSchema,
	show_ui: z.boolean(),
	show_in_menu: z.boolean(),
	meta_box: z.enum(["automatic", "category", "tag", "hidden"]),
	show_in_nav_menus: z.boolean(),
	show_tagcloud: z.boolean(),
	show_in_quick_edit: z.boolean(),
	show_admin_column: z.boolean(),
	publicly_queryable: z.boolean(),
})
export type TaxonomyRegistrationInput = z.input<typeof TaxonomyRegistrationSchema>
export type TaxonomyRegistrationOutput = z.output<typeof TaxonomyRegistrationSchema>

export const CreateTaxonomyRegistrationSchema = TaxonomyRegistrationSchema.extend({
	key: createRegistrationKeySchema(32),
})
export type CreateTaxonomyRegistrationInput = z.input<typeof CreateTaxonomyRegistrationSchema>
export type CreateTaxonomyRegistrationOutput = z.output<typeof CreateTaxonomyRegistrationSchema>

// ====================================================
// UNIFIED SCHEMA
// ====================================================

// A Kizlo-owned type is edited as one form saved to /settings/{kind}/{slug}:
// the per-slug Kizlo settings plus the WordPress definition. The two shapes are
// key-disjoint, so they merge cleanly. The definition half is optional so the
// same schema also validates a built-in type (settings only, no definition);
// for a Kizlo-owned type every definition field is always present, so its own
// constraints (e.g. a required label) still apply.

export const PostTypeUnifiedSchema = PostTypeSettingsSchema.extend(PostTypeRegistrationSchema.partial().shape)
export type PostTypeUnifiedInput = z.input<typeof PostTypeUnifiedSchema>
export type PostTypeUnifiedOutput = z.output<typeof PostTypeUnifiedSchema>

/** Unified post-type schema carrying the same custom-field refinements as the settings-only one. */
export function createPostTypeUnifiedSchema(reservedFieldNames: Iterable<string>) {
	const reserved = new Set(reservedFieldNames)
	return PostTypeUnifiedSchema.superRefine((val, ctx) => {
		refineFieldNames(val.custom_fields, ctx)
		refineReservedNames(val.custom_fields, reserved, ctx)
	})
}

export const TaxonomyUnifiedSchema = TaxonomySettingsSchema.extend(TaxonomyRegistrationSchema.partial().shape)
export type TaxonomyUnifiedInput = z.input<typeof TaxonomyUnifiedSchema>
export type TaxonomyUnifiedOutput = z.output<typeof TaxonomyUnifiedSchema>

/** Unified taxonomy schema carrying the same custom-field refinements as the settings-only one. */
export function createTaxonomyUnifiedSchema(reservedFieldNames: Iterable<string>) {
	const reserved = new Set(reservedFieldNames)
	return TaxonomyUnifiedSchema.superRefine((val, ctx) => {
		refineFieldNames(val.custom_fields, ctx)
		refineReservedNames(val.custom_fields, reserved, ctx)
	})
}

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

// ====================================================
// UPLOADS SCHEMA
// ====================================================

/**
 * Extensions the server refuses (see UploadsSettings::DENIED_EXTENSIONS). Kept
 * in sync for inline feedback; the PHP list is the authoritative gate.
 */
const DENIED_UPLOAD_EXTENSIONS = new Set([
	"php",
	"php2",
	"php3",
	"php4",
	"php5",
	"php6",
	"php7",
	"php8",
	"phtml",
	"pht",
	"phps",
	"phar",
	"phpt",
	"cgi",
	"pl",
	"py",
	"rb",
	"sh",
	"bash",
	"ksh",
	"zsh",
	"exe",
	"com",
	"bat",
	"cmd",
	"msi",
	"scr",
	"dll",
	"jar",
	"js",
	"mjs",
	"cjs",
	"jsp",
	"asp",
	"aspx",
	"html",
	"htm",
	"xhtml",
	"shtml",
	"shtm",
	"htaccess",
	"htpasswd",
	"ini",
	"so",
])

export const UploadMimeSchema = z.object({
	ext: z
		.string()
		.trim()
		.toLowerCase()
		.min(1, "Extension is required.")
		.regex(/^[a-z0-9]+$/, "Letters and numbers only, no dot.")
		.refine((ext) => !DENIED_UPLOAD_EXTENSIONS.has(ext), "This file type is blocked for security reasons."),
	mime: z
		.string()
		.trim()
		.toLowerCase()
		.min(1, "MIME type is required.")
		.regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/, "Enter a valid MIME type, e.g. image/svg+xml."),
})
export type UploadMimeInput = z.input<typeof UploadMimeSchema>

export const UploadsSettingsSchema = z.object({
	allowed_mimes: z.array(UploadMimeSchema),
})
export type UploadsSettingsInput = z.input<typeof UploadsSettingsSchema>
export type UploadsSettingsOutput = z.output<typeof UploadsSettingsSchema>

// ====================================================
// HEADLESS SCHEMA
// ====================================================

export const HeadlessSettingsSchema = z.object({
	enabled: z.boolean(),
	preview: z.boolean(),
	view_links: z.boolean(),
	block_indexing: z.boolean(),
	frontend_lockout: z.boolean(),
	frontend_lockout_redirect: z.boolean(),
	disable_feeds: z.boolean(),
	disable_embeds: z.boolean(),
	disable_xmlrpc: z.boolean(),
	block_enumeration: z.boolean(),
	clean_head: z.boolean(),
	disable_file_editor: z.boolean(),
	disable_pingbacks: z.boolean(),
	rename_login: z.boolean(),
	login_slug: NulledStringSchema,
})
export type HeadlessSettingsInput = z.input<typeof HeadlessSettingsSchema>
export type HeadlessSettingsOutput = z.output<typeof HeadlessSettingsSchema>

export interface SettingsMap {
	site: SiteSettingsSchemaOutput
	brand: BrandSettingsSchemaOutput
	identity: IdentitySettingsOutput
	authors: AuthorSettingsOutput
	// Kizlo-owned types send settings + definition in one payload; built-in types
	// send settings only (the definition half of the unified output is optional).
	post_types: PostTypeUnifiedOutput
	taxonomies: TaxonomyUnifiedOutput
	webhook: WebhookSettingsOutput
	crawling: CrawlingSettingsOutput
	uploads: UploadsSettingsOutput
	headless: HeadlessSettingsOutput
}
