// ====================================================
// KIZLO SETTINGS — CANONICAL RESPONSE CONTRACT
// ====================================================

import type { Media } from "./schema"

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
	app_icon: Media | null
	theme_color: string | null
	theme_color_dark: string | null
	background_color: string | null
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

/** Editable registration definition of a Kizlo-owned custom post type. Mirrors the PHP `PostTypeRegistration` shape. */
export interface PostTypeRegistration {
	active: boolean
	/** Registration key. Generated on creation and immutable afterward. */
	key: string
	singular_label: string
	plural_label: string
	description: string
	public: boolean
	hierarchical: boolean
	/** Individual WordPress label overrides; unset labels are generated from the singular/plural. */
	labels: Record<string, string>
	/** Connected taxonomy keys. */
	taxonomies: string[]
	/** Enabled editor supports (excludes the legacy custom-fields metabox). */
	supports: string[]
	show_ui: boolean
	show_in_menu: boolean
	menu_parent: string | null
	menu_position: number | null
	menu_icon: string | null
	show_in_admin_bar: boolean
	show_in_nav_menus: boolean
	exclude_from_search: boolean
	publicly_queryable: boolean
	rewrite_enabled: boolean
	rewrite_slug: string | null
	rewrite_with_front: boolean
	rewrite_feeds: boolean
	rewrite_pages: boolean
	archive: "disabled" | "default" | "custom"
	archive_slug: string | null
	capability_type: "post" | "page" | "custom"
	capability_singular: string | null
	capability_plural: string | null
	can_export: boolean
	delete_with_user: boolean
	rest_base: string | null
}

/** Editable registration definition of a Kizlo-owned taxonomy. Mirrors the PHP `TaxonomyRegistration` shape. */
export interface TaxonomyRegistration {
	active: boolean
	/** Registration key. Generated on creation and immutable afterward. */
	key: string
	singular_label: string
	plural_label: string
	description: string
	public: boolean
	hierarchical: boolean
	labels: Record<string, string>
	/** Connected post type keys. */
	object_types: string[]
	sort: boolean
	default_term_name: string | null
	default_term_slug: string | null
	default_term_description: string | null
	show_ui: boolean
	show_in_menu: boolean
	/** Editor control: automatic default, WordPress category/tag metabox, or hidden. */
	meta_box: "automatic" | "category" | "tag" | "hidden"
	show_in_nav_menus: boolean
	show_tagcloud: boolean
	show_in_quick_edit: boolean
	show_admin_column: boolean
	publicly_queryable: boolean
	rewrite_enabled: boolean
	rewrite_slug: string | null
	rewrite_with_front: boolean
	rewrite_hierarchical: boolean
	rest_base: string | null
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
	content_variables: Variable[]
	supports: PostTypeSupports
	custom_fields: CustomFieldDefinition[]
	/** True when Kizlo owns this post type's WordPress registration and can edit it. */
	kizlo_owned: boolean
	/** Whether the object is registered with WordPress. Always true for core/third-party objects. */
	active: boolean
	/** Editable registration; null unless `kizlo_owned`. */
	registration: PostTypeRegistration | null
}

export interface TaxonomySettings extends Omit<BaseContentSettings, "webpage_type" | "article_type"> {
	name: string
	slug: string
	hierarchical: boolean
	seo_enabled: boolean
	pathname_structure: string | null
	rest_api_enabled: boolean
	internal: boolean
	custom_fields: CustomFieldDefinition[]
	/** True when Kizlo owns this taxonomy's WordPress registration and can edit it. */
	kizlo_owned: boolean
	/** Whether the object is registered with WordPress. Always true for core/third-party objects. */
	active: boolean
	/** Editable registration; null unless `kizlo_owned`. */
	registration: TaxonomyRegistration | null
}

// ====================================================
// CUSTOM FIELDS — ACF-style definitions + values
// ====================================================

export type CustomFieldType =
	| "text"
	| "textarea"
	| "richtext"
	| "number"
	| "toggle"
	| "select"
	| "multiselect"
	| "url"
	| "email"
	| "date"
	| "image"
	| "file"
	| "group"
	| "repeater"

export interface CustomFieldChoice {
	value: string
	label: string
}

interface CustomFieldBase {
	/** Permanent generated identifier, e.g. `field_a1b2c3`. Never changes once created. */
	key: string
	/** Meta-key segment. Locked after first save; drives the generated `kcf_*` key. */
	name: string
	label: string
	instructions: string
	required: boolean
}

export interface TextFieldDefinition extends CustomFieldBase {
	type: "text"
	default: string | null
}

export interface TextareaFieldDefinition extends CustomFieldBase {
	type: "textarea"
	default: string | null
}

export interface RichTextFieldDefinition extends CustomFieldBase {
	type: "richtext"
	default: string | null
}

export interface NumberFieldDefinition extends CustomFieldBase {
	type: "number"
	default: number | null
	min: number | null
	max: number | null
	step: number | null
}

export interface ToggleFieldDefinition extends CustomFieldBase {
	type: "toggle"
	default: boolean
}

export interface SelectFieldDefinition extends CustomFieldBase {
	type: "select"
	choices: CustomFieldChoice[]
	default: string | null
}

export interface MultiSelectFieldDefinition extends CustomFieldBase {
	type: "multiselect"
	choices: CustomFieldChoice[]
	default: string[]
}

export interface UrlFieldDefinition extends CustomFieldBase {
	type: "url"
	default: string | null
}

export interface EmailFieldDefinition extends CustomFieldBase {
	type: "email"
	default: string | null
}

export interface DateFieldDefinition extends CustomFieldBase {
	type: "date"
	default: string | null
}

export interface ImageFieldDefinition extends CustomFieldBase {
	type: "image"
}

export interface FileFieldDefinition extends CustomFieldBase {
	type: "file"
}

export interface GroupFieldDefinition extends CustomFieldBase {
	type: "group"
	fields: CustomFieldDefinition[]
}

export interface RepeaterFieldDefinition extends CustomFieldBase {
	type: "repeater"
	fields: CustomFieldDefinition[]
	/** Row bounds; null means unbounded (reserves the 10-digit index in key-length checks). */
	min: number | null
	max: number | null
}

export type CustomFieldDefinition =
	| TextFieldDefinition
	| TextareaFieldDefinition
	| RichTextFieldDefinition
	| NumberFieldDefinition
	| ToggleFieldDefinition
	| SelectFieldDefinition
	| MultiSelectFieldDefinition
	| UrlFieldDefinition
	| EmailFieldDefinition
	| DateFieldDefinition
	| ImageFieldDefinition
	| FileFieldDefinition
	| GroupFieldDefinition
	| RepeaterFieldDefinition

/**
 * Resolved custom-field value. Top-level fields are injected onto the REST response
 * root (keyed by field name) and accepted on Kizlo writes. Media fields resolve to
 * {@link Media}; groups nest an object and repeaters an array of row objects.
 */
export type CustomFieldValue = string | number | boolean | null | string[] | Media | CustomFieldValues | CustomFieldValues[]

export interface CustomFieldValues {
	[name: string]: CustomFieldValue
}

export interface CrawlingSettings {
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

export interface UploadMime {
	ext: string
	mime: string
}

export interface UploadsSettings {
	allowed_mimes: UploadMime[]
}

export interface HeadlessSettings {
	enabled: boolean
	preview: boolean
	view_links: boolean
	block_indexing: boolean
	frontend_lockout: boolean
	frontend_lockout_redirect: boolean
	disable_feeds: boolean
	disable_embeds: boolean
	disable_xmlrpc: boolean
	block_enumeration: boolean
	clean_head: boolean
	disable_file_editor: boolean
	disable_pingbacks: boolean
	rename_login: boolean
	login_slug: string | null
}

export interface PostStatusDefinition {
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
	uploads: UploadsSettings
	headless: HeadlessSettings
	statuses: PostStatusDefinition[]
	plain_permalinks: boolean
}

// ====================================================
// CONSTANTS — bootstrap-only (getPluginData)
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
	/** Reserved field names collide with the term REST response keys (+ `kizlo`). */
	taxonomy: SettingsVariableGroup & { reserved_field_names: string[] }
	/** Reserved field names collide with the post REST response keys (+ `kizlo`). */
	post_type: SettingsVariableGroup & { reserved_field_names: string[] }
	author: SettingsVariableGroup
}
