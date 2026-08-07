import type { PostTypeRegistration, Settings as SharedSettings, TaxonomyRegistration } from "@kizlo/shared"
import apiFetch from "@wordpress/api-fetch"
import type {
	PostTypeRegistrationInput,
	PostTypeRegistrationOutput,
	TaxonomyRegistrationInput,
	TaxonomyRegistrationOutput,
} from "@/shared/lib/schema"
import { $settings } from "@/shared/lib/store"
import type { NavBlock } from "@/shared/lib/types"

export type RegistrationKind = "post_types" | "taxonomies"

/** Pull the human message off a WordPress REST error, falling back to a default. */
export function apiErrorMessage(error: unknown, fallback: string): string {
	const message = (error as { message?: unknown })?.message
	return typeof message === "string" && message.trim() !== "" ? message : fallback
}

const BASE = "/kizlo/v1/settings"

export interface DeletionProgress {
	slug: string
	kind: string
	total: number
	deleted: number
	failed: number
	remaining: number
	status: string
	complete: boolean
}

/**
 * Labels WordPress derives from the singular and plural names. Kept in sync with
 * the PHP generatedLabels() in the registration definitions so the admin form can
 * preview, as placeholders, exactly what a blank override field will register.
 */
export function postTypeGeneratedLabels(singular: string, plural: string): Record<string, string> {
	const s = singular.trim()
	const p = plural.trim()
	const sl = s.toLowerCase()
	const pl = p.toLowerCase()
	const fromSingular = (value: string): string => (s ? value : "")
	const fromPlural = (value: string): string => (p ? value : "")

	return {
		name: p,
		singular_name: s,
		menu_name: p,
		name_admin_bar: s,
		add_new: "Add New",
		add_new_item: fromSingular(`Add New ${s}`),
		new_item: fromSingular(`New ${s}`),
		edit_item: fromSingular(`Edit ${s}`),
		view_item: fromSingular(`View ${s}`),
		view_items: fromPlural(`View ${p}`),
		search_items: fromPlural(`Search ${p}`),
		not_found: fromPlural(`No ${pl} found.`),
		not_found_in_trash: fromPlural(`No ${pl} found in Trash.`),
		parent_item_colon: fromSingular(`Parent ${s}:`),
		all_items: fromPlural(`All ${p}`),
		archives: fromPlural(`${p} Archives`),
		attributes: fromSingular(`${s} Attributes`),
		insert_into_item: fromSingular(`Insert into ${sl}`),
		uploaded_to_this_item: fromSingular(`Uploaded to this ${sl}`),
		filter_items_list: fromPlural(`Filter ${pl} list`),
		items_list_navigation: fromPlural(`${p} list navigation`),
		items_list: fromPlural(`${p} list`),
		item_published: fromSingular(`${s} published.`),
		item_published_privately: fromSingular(`${s} published privately.`),
		item_reverted_to_draft: fromSingular(`${s} reverted to draft.`),
		item_scheduled: fromSingular(`${s} scheduled.`),
		item_updated: fromSingular(`${s} updated.`),
		item_link: fromSingular(`${s} Link`),
		item_link_description: fromSingular(`A link to a ${sl}.`),
	}
}

/**
 * Labels WordPress derives from the singular and plural names for a taxonomy. Kept
 * in sync with the PHP generatedLabels() in TaxonomyRegistration.
 */
export function taxonomyGeneratedLabels(singular: string, plural: string): Record<string, string> {
	const s = singular.trim()
	const p = plural.trim()
	const sl = s.toLowerCase()
	const pl = p.toLowerCase()
	const fromSingular = (value: string): string => (s ? value : "")
	const fromPlural = (value: string): string => (p ? value : "")

	return {
		name: p,
		singular_name: s,
		menu_name: p,
		all_items: fromPlural(`All ${p}`),
		edit_item: fromSingular(`Edit ${s}`),
		view_item: fromSingular(`View ${s}`),
		update_item: fromSingular(`Update ${s}`),
		add_new_item: fromSingular(`Add New ${s}`),
		new_item_name: fromSingular(`New ${s} Name`),
		parent_item: fromSingular(`Parent ${s}`),
		parent_item_colon: fromSingular(`Parent ${s}:`),
		search_items: fromPlural(`Search ${p}`),
		popular_items: fromPlural(`Popular ${p}`),
		separate_items_with_commas: fromPlural(`Separate ${pl} with commas`),
		add_or_remove_items: fromPlural(`Add or remove ${pl}`),
		choose_from_most_used: fromPlural(`Choose from the most used ${pl}`),
		not_found: fromPlural(`No ${pl} found.`),
		no_terms: fromPlural(`No ${pl}`),
		filter_by_item: fromSingular(`Filter by ${sl}`),
		items_list_navigation: fromPlural(`${p} list navigation`),
		items_list: fromPlural(`${p} list`),
		back_to_items: fromPlural(`← Go to ${p}`),
		item_link: fromSingular(`${s} Link`),
		item_link_description: fromSingular(`A link to a ${sl}.`),
	}
}

/** Turn a human label into a valid registration key. */
export function generateKey(label: string, maxLength: number): string {
	return label
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^[^a-z]+/, "")
		.replace(/_+/g, "_")
		.replace(/^_|_$/g, "")
		.slice(0, maxLength)
}

/**
 * Re-fetch the full settings payload after a registration mutation and merge it
 * into the store. Constants are bootstrap-only (absent from GET /settings), so
 * the existing ones are preserved.
 */
export async function refreshSettings(): Promise<void> {
	// The admin nav is only attached to GET /settings when this internal flag is
	// present (see SettingsModule::INTERNAL_QUERY_FLAG); the SDK contract omits it, so
	// widen the fetch here. Constants are bootstrap-only (absent from GET
	// /settings), so the existing ones are kept.
	const data = await apiFetch<SharedSettings & { nav: NavBlock[] }>({ path: "/kizlo/v1/settings?__internals=1" })
	const existing = $settings.get()

	if (existing) $settings.set({ ...data, constants: existing.constants })
}

export async function createRegistration(
	kind: RegistrationKind,
	payload: (PostTypeRegistrationOutput | TaxonomyRegistrationOutput) & { key: string },
): Promise<{ slug: string; restored: boolean }> {
	// Use api-fetch's `data` shorthand so it sets Content-Type: application/json.
	// A raw `body` string leaves the header unset, which api-fetch only fills in
	// for PUT/PATCH/DELETE (via the http-v1 middleware) — a POST would arrive with
	// an unparsed body and WordPress would see no params.
	const result = await apiFetch<{ slug: string; restored: boolean }>({
		method: "POST",
		path: `${BASE}/${kind}`,
		data: payload,
	})

	await refreshSettings()
	return result
}

export async function deleteRegistration(
	kind: RegistrationKind,
	slug: string,
	mode: "keep_items" | "delete_items",
): Promise<DeletionProgress> {
	return apiFetch<DeletionProgress>({
		method: "POST",
		path: `${BASE}/${kind}/${slug}/delete`,
		data: { mode },
	})
}

export async function processDeletion(kind: RegistrationKind, slug: string): Promise<DeletionProgress> {
	return apiFetch<DeletionProgress>({ method: "POST", path: `${BASE}/${kind}/${slug}/delete/process` })
}

export async function retryDeletion(kind: RegistrationKind, slug: string): Promise<DeletionProgress> {
	return apiFetch<DeletionProgress>({ method: "POST", path: `${BASE}/${kind}/${slug}/delete/retry` })
}

const POST_TYPE_DEFAULTS: PostTypeRegistrationInput = {
	active: true,
	singular_label: "",
	plural_label: "",
	description: "",
	public: true,
	hierarchical: false,
	labels: {},
	taxonomies: [],
	supports: ["title", "editor"],
	show_ui: true,
	show_in_menu: true,
	menu_parent: "",
	menu_position: "",
	menu_icon: "",
	show_in_admin_bar: true,
	show_in_nav_menus: true,
	exclude_from_search: false,
	publicly_queryable: true,
	capability_type: "post",
	capability_singular: "",
	capability_plural: "",
	can_export: true,
	delete_with_user: false,
}

const TAXONOMY_DEFAULTS: TaxonomyRegistrationInput = {
	active: true,
	singular_label: "",
	plural_label: "",
	description: "",
	public: true,
	hierarchical: false,
	labels: {},
	object_types: [],
	sort: false,
	default_term_name: "",
	default_term_slug: "",
	default_term_description: "",
	show_ui: true,
	show_in_menu: true,
	meta_box: "automatic",
	show_in_nav_menus: true,
	show_tagcloud: true,
	show_in_quick_edit: true,
	show_admin_column: false,
	publicly_queryable: true,
}

const text = (value: string | null): string => value ?? ""

/** Form values for the post-type registration form, from an existing definition or defaults. */
export function postTypeRegistrationValues(registration: PostTypeRegistration | null): PostTypeRegistrationInput {
	if (!registration) return { ...POST_TYPE_DEFAULTS }

	return {
		active: registration.active,
		singular_label: registration.singular_label,
		plural_label: registration.plural_label,
		description: registration.description,
		public: registration.public,
		hierarchical: registration.hierarchical,
		labels: registration.labels ?? {},
		taxonomies: registration.taxonomies ?? [],
		supports: registration.supports ?? [],
		show_ui: registration.show_ui,
		show_in_menu: registration.show_in_menu,
		menu_parent: text(registration.menu_parent),
		menu_position: registration.menu_position ?? "",
		menu_icon: text(registration.menu_icon),
		show_in_admin_bar: registration.show_in_admin_bar,
		show_in_nav_menus: registration.show_in_nav_menus,
		exclude_from_search: registration.exclude_from_search,
		publicly_queryable: registration.publicly_queryable,
		capability_type: registration.capability_type,
		capability_singular: text(registration.capability_singular),
		capability_plural: text(registration.capability_plural),
		can_export: registration.can_export,
		delete_with_user: registration.delete_with_user,
	}
}

/** Form values for the taxonomy registration form, from an existing definition or defaults. */
export function taxonomyRegistrationValues(registration: TaxonomyRegistration | null): TaxonomyRegistrationInput {
	if (!registration) return { ...TAXONOMY_DEFAULTS }

	return {
		active: registration.active,
		singular_label: registration.singular_label,
		plural_label: registration.plural_label,
		description: registration.description,
		public: registration.public,
		hierarchical: registration.hierarchical,
		labels: registration.labels ?? {},
		object_types: registration.object_types ?? [],
		sort: registration.sort,
		default_term_name: text(registration.default_term_name),
		default_term_slug: text(registration.default_term_slug),
		default_term_description: text(registration.default_term_description),
		show_ui: registration.show_ui,
		show_in_menu: registration.show_in_menu,
		meta_box: registration.meta_box,
		show_in_nav_menus: registration.show_in_nav_menus,
		show_tagcloud: registration.show_tagcloud,
		show_in_quick_edit: registration.show_in_quick_edit,
		show_admin_column: registration.show_admin_column,
		publicly_queryable: registration.publicly_queryable,
	}
}
