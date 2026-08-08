import { useEffect, useMemo, useRef } from "react"
import { type Control, type UseFormReturn, useWatch } from "react-hook-form"
import { ComboboxField, NumberInputField, SelectField, type SelectOption, SwitchField, TextInputField } from "@/shared/components/fields"
import type { PostTypeRegistrationInput, PostTypeRegistrationOutput } from "@/shared/lib/schema"
import { postTypeGeneratedLabels } from "./lib"

/**
 * Presentational field groups for a Kizlo-owned post type's WordPress definition.
 * Each returns raw fields; the caller wraps them in a `SettingsCard` so the same
 * pieces can be placed standalone (create page) or interleaved into the edit
 * page's concept groups (e.g. editor supports beside custom fields under "Fields").
 */

type Ctrl = Control<PostTypeRegistrationInput, unknown, PostTypeRegistrationOutput>

const SUPPORTS_OPTIONS: SelectOption[] = [
	{ value: "title", label: "Title" },
	{ value: "editor", label: "Editor" },
	{ value: "author", label: "Author" },
	{ value: "thumbnail", label: "Featured image" },
	{ value: "excerpt", label: "Excerpt" },
	{ value: "comments", label: "Comments" },
	{ value: "revisions", label: "Revisions" },
	{ value: "page-attributes", label: "Page attributes" },
	{ value: "post-formats", label: "Post formats" },
]

const CAPABILITY_OPTIONS: SelectOption[] = [
	{ value: "post", label: "Same as posts" },
	{ value: "page", label: "Same as pages" },
	{ value: "custom", label: "Dedicated capabilities" },
]

const LABEL_OVERRIDES: [string, string][] = [
	["menu_name", "Menu name"],
	["all_items", "All items"],
	["add_new", "Add new"],
	["add_new_item", "Add new item"],
	["edit_item", "Edit item"],
	["new_item", "New item"],
	["view_item", "View item"],
	["search_items", "Search items"],
	["not_found", "Not found"],
]

export function PostTypeIdentityFields({ control }: { control: Ctrl }) {
	return (
		<div className="flex flex-col gap-6 sm:flex-row sm:gap-4">
			<div className="flex-1">
				<TextInputField control={control} name="singular_label" label="Singular label" placeholder="Book" />
			</div>
			<div className="flex-1">
				<TextInputField control={control} name="plural_label" label="Plural label" placeholder="Books" />
			</div>
		</div>
	)
}

export function PostTypeActiveField({ control }: { control: Ctrl }) {
	return (
		<SwitchField
			control={control}
			name="active"
			label="Active"
			description="Register this post type with WordPress and include it in Kizlo."
		/>
	)
}

export function PostTypePublicField({ control }: { control: Ctrl }) {
	return <SwitchField control={control} name="public" label="Public" description="Show entries on the site and make them queryable." />
}

export function PostTypeHierarchicalField({ control }: { control: Ctrl }) {
	return <SwitchField control={control} name="hierarchical" label="Hierarchical" description="Allow parent/child entries, like pages." />
}

export function PostTypeBasicsFields({ control }: { control: Ctrl }) {
	return (
		<>
			<PostTypeIdentityFields control={control} />
			<PostTypeActiveField control={control} />
			<PostTypePublicField control={control} />
			<PostTypeHierarchicalField control={control} />
		</>
	)
}

export function PostTypeEditorSupportsFields({ control, taxonomyOptions }: { control: Ctrl; taxonomyOptions: SelectOption[] }) {
	return (
		<>
			<ComboboxField control={control} name="supports" label="Editor supports" options={SUPPORTS_OPTIONS} multiple />
			<ComboboxField control={control} name="taxonomies" label="Connected taxonomies" options={taxonomyOptions} multiple />
		</>
	)
}

export function PostTypeExportField({ control }: { control: Ctrl }) {
	return (
		<SwitchField
			control={control}
			name="can_export"
			label="Allow export"
			description="Include entries in the files produced by WordPress's Tools → Export."
		/>
	)
}

export function PostTypeDeleteWithUserField({ control }: { control: Ctrl }) {
	return (
		<SwitchField
			control={control}
			name="delete_with_user"
			label="Delete entries with their author"
			description="When a user is deleted, also delete the entries they authored instead of leaving them unassigned."
		/>
	)
}

export function PostTypeEditorFields({ control, taxonomyOptions }: { control: Ctrl; taxonomyOptions: SelectOption[] }) {
	return (
		<>
			<PostTypeEditorSupportsFields control={control} taxonomyOptions={taxonomyOptions} />
			<PostTypeExportField control={control} />
			<PostTypeDeleteWithUserField control={control} />
		</>
	)
}

export function PostTypeShowUiField({ control }: { control: Ctrl }) {
	return (
		<SwitchField
			control={control}
			name="show_ui"
			label="Show admin UI"
			description="Generate the list and editor screens for managing these entries in wp-admin."
		/>
	)
}

export function PostTypeShowInMenuField({ control }: { control: Ctrl }) {
	return (
		<SwitchField
			control={control}
			name="show_in_menu"
			label="Show in admin menu"
			description="Add a link to these entries in the wp-admin sidebar. Requires the admin UI."
		/>
	)
}

export function PostTypeMenuDetailsFields({ control }: { control: Ctrl }) {
	return (
		<>
			<TextInputField
				control={control}
				name="menu_parent"
				label="Menu parent"
				description="Nest under an existing top-level menu slug (e.g. tools.php). Leave empty for a top-level item."
			/>
			<NumberInputField control={control} name="menu_position" label="Menu position" />
			<TextInputField control={control} name="menu_icon" label="Menu icon" placeholder="dashicons-book" />
		</>
	)
}

export function PostTypeShowInAdminBarField({ control }: { control: Ctrl }) {
	return (
		<SwitchField
			control={control}
			name="show_in_admin_bar"
			label="Show in admin bar"
			description="List these entries under the New button in the toolbar."
		/>
	)
}

export function PostTypeShowInNavMenusField({ control }: { control: Ctrl }) {
	return (
		<SwitchField
			control={control}
			name="show_in_nav_menus"
			label="Available in navigation menus"
			description="Let these entries be added to menus under Appearance → Menus."
		/>
	)
}

export function PostTypeAdminFields({ control }: { control: Ctrl }) {
	const showInMenu = useWatch({ control, name: "show_in_menu" })

	return (
		<>
			<PostTypeShowUiField control={control} />
			<PostTypeShowInMenuField control={control} />
			{showInMenu ? <PostTypeMenuDetailsFields control={control} /> : null}
			<PostTypeShowInAdminBarField control={control} />
			<PostTypeShowInNavMenusField control={control} />
		</>
	)
}

export function PostTypeExcludeFromSearchField({ control }: { control: Ctrl }) {
	return (
		<SwitchField
			control={control}
			name="exclude_from_search"
			label="Exclude from site search"
			description="Keep entries out of WordPress's built-in site search results."
		/>
	)
}

export function PostTypeApiFields({ control }: { control: Ctrl }) {
	return (
		<SwitchField
			control={control}
			name="publicly_queryable"
			label="Publicly queryable"
			description="Allow entries to be requested directly through public URL query variables."
		/>
	)
}

export function PostTypeCapabilityFields({ control }: { control: Ctrl }) {
	const capabilityType = useWatch({ control, name: "capability_type" })

	return (
		<>
			<SelectField control={control} name="capability_type" label="Capability preset" options={CAPABILITY_OPTIONS} />
			{capabilityType === "custom" ? (
				<>
					<TextInputField control={control} name="capability_singular" label="Singular capability name" placeholder="book" />
					<TextInputField control={control} name="capability_plural" label="Plural capability name" placeholder="books" />
				</>
			) : null}
		</>
	)
}

export function PostTypeLabelFields({ control }: { control: Ctrl }) {
	const singular = useWatch({ control, name: "singular_label" })
	const plural = useWatch({ control, name: "plural_label" })
	const generatedLabels = useMemo(() => postTypeGeneratedLabels(singular ?? "", plural ?? ""), [singular, plural])

	return (
		<>
			{LABEL_OVERRIDES.map(([key, label]) => (
				<TextInputField key={key} control={control} name={`labels.${key}`} label={label} placeholder={generatedLabels[key] || undefined} />
			))}
		</>
	)
}

/**
 * Keep blank label-override fields tracking the labels generated from the singular
 * and plural names, without clobbering a manual edit. Shared by the create and edit
 * forms so both preview and register exactly what a blank override would.
 */
export function usePostTypeLabelSync(form: UseFormReturn<PostTypeRegistrationInput, unknown, PostTypeRegistrationOutput>): void {
	const singular = useWatch({ control: form.control, name: "singular_label" })
	const plural = useWatch({ control: form.control, name: "plural_label" })
	const generatedLabels = useMemo(() => postTypeGeneratedLabels(singular ?? "", plural ?? ""), [singular, plural])

	const previousLabels = useRef<Record<string, string>>({})
	useEffect(() => {
		const { setValue, getValues } = form
		for (const [key] of LABEL_OVERRIDES) {
			const next = generatedLabels[key] ?? ""
			const path = `labels.${key}` as const
			const current = getValues(path)
			if (current === undefined || current === "" || current === previousLabels.current[key]) {
				setValue(path, next, { shouldDirty: false })
			}
			previousLabels.current[key] = next
		}
	}, [form, generatedLabels])
}

/** Renders nothing; mounts {@link usePostTypeLabelSync} so it can be gated behind Kizlo-owned. */
export function PostTypeLabelSync({ form }: { form: UseFormReturn<PostTypeRegistrationInput, unknown, PostTypeRegistrationOutput> }): null {
	usePostTypeLabelSync(form)
	return null
}
