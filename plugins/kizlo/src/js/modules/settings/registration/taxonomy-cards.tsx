import { useEffect, useMemo, useRef } from "react"
import { type Control, type UseFormReturn, useWatch } from "react-hook-form"
import { ComboboxField, SelectField, type SelectOption, SwitchField, TextareaInputField, TextInputField } from "@/shared/components/fields"
import type { TaxonomyRegistrationInput, TaxonomyRegistrationOutput } from "@/shared/lib/schema"
import { taxonomyGeneratedLabels } from "./lib"

/**
 * Presentational field groups for a Kizlo-owned taxonomy's WordPress definition.
 * Each returns raw fields; the caller wraps them in a `SettingsCard`.
 */

type Ctrl = Control<TaxonomyRegistrationInput, unknown, TaxonomyRegistrationOutput>

const META_BOX_OPTIONS: SelectOption[] = [
	{ value: "automatic", label: "Automatic" },
	{ value: "category", label: "Category-style (checkboxes)" },
	{ value: "tag", label: "Tag-style (free text)" },
	{ value: "hidden", label: "Hidden" },
]

const LABEL_OVERRIDES: [string, string][] = [
	["menu_name", "Menu name"],
	["all_items", "All items"],
	["add_new_item", "Add new item"],
	["edit_item", "Edit item"],
	["new_item_name", "New item name"],
	["search_items", "Search items"],
	["not_found", "Not found"],
]

export function TaxonomyIdentityFields({ control }: { control: Ctrl }) {
	return (
		<div className="flex flex-col gap-6 sm:flex-row sm:gap-4">
			<div className="flex-1">
				<TextInputField control={control} name="singular_label" label="Singular label" placeholder="Genre" />
			</div>
			<div className="flex-1">
				<TextInputField control={control} name="plural_label" label="Plural label" placeholder="Genres" />
			</div>
		</div>
	)
}

export function TaxonomyActiveField({ control }: { control: Ctrl }) {
	return (
		<SwitchField
			control={control}
			name="active"
			label="Active"
			description="Register this taxonomy with WordPress and include it in Kizlo."
		/>
	)
}

export function TaxonomyPublicField({ control }: { control: Ctrl }) {
	return <SwitchField control={control} name="public" label="Public" description="Show terms on the site and make them queryable." />
}

export function TaxonomyHierarchicalField({ control }: { control: Ctrl }) {
	return <SwitchField control={control} name="hierarchical" label="Hierarchical" description="Allow parent/child terms, like categories." />
}

export function TaxonomyBasicsFields({ control }: { control: Ctrl }) {
	return (
		<>
			<TaxonomyIdentityFields control={control} />
			<TaxonomyActiveField control={control} />
			<TaxonomyPublicField control={control} />
			<TaxonomyHierarchicalField control={control} />
		</>
	)
}

export function TaxonomyContentFields({ control, postTypeOptions }: { control: Ctrl; postTypeOptions: SelectOption[] }) {
	return <ComboboxField control={control} name="object_types" label="Connected post types" options={postTypeOptions} multiple />
}

export function TaxonomySortField({ control }: { control: Ctrl }) {
	return (
		<SwitchField control={control} name="sort" label="Remember term order" description="Preserve the order terms are added to an entry." />
	)
}

export function TaxonomyDefaultTermFields({ control }: { control: Ctrl }) {
	return (
		<>
			<TextInputField control={control} name="default_term_name" label="Name" />
			<TextInputField control={control} name="default_term_slug" label="Slug" />
			<TextareaInputField control={control} name="default_term_description" label="Description" />
		</>
	)
}

export function TaxonomyShowUiField({ control }: { control: Ctrl }) {
	return (
		<SwitchField
			control={control}
			name="show_ui"
			label="Show admin UI"
			description="Generate the screens for managing these terms in wp-admin."
		/>
	)
}

export function TaxonomyShowInMenuField({ control }: { control: Ctrl }) {
	return (
		<SwitchField
			control={control}
			name="show_in_menu"
			label="Show in admin menu"
			description="Add a link to these terms in the wp-admin sidebar. Requires the admin UI."
		/>
	)
}

export function TaxonomyMetaBoxField({ control }: { control: Ctrl }) {
	return (
		<SelectField
			control={control}
			name="meta_box"
			label="Editor control"
			options={META_BOX_OPTIONS}
			description="Which control the editor uses to assign terms to an entry."
		/>
	)
}

export function TaxonomyShowInNavMenusField({ control }: { control: Ctrl }) {
	return (
		<SwitchField
			control={control}
			name="show_in_nav_menus"
			label="Available in navigation menus"
			description="Let these terms be added to menus under Appearance → Menus."
		/>
	)
}

export function TaxonomyShowTagcloudField({ control }: { control: Ctrl }) {
	return (
		<SwitchField
			control={control}
			name="show_tagcloud"
			label="Available in the tag cloud widget"
			description="Allow these terms to appear in the Tag Cloud widget."
		/>
	)
}

export function TaxonomyShowInQuickEditField({ control }: { control: Ctrl }) {
	return (
		<SwitchField
			control={control}
			name="show_in_quick_edit"
			label="Show in Quick Edit"
			description="Show these terms in the Quick Edit panel of the entry list."
		/>
	)
}

export function TaxonomyShowAdminColumnField({ control }: { control: Ctrl }) {
	return (
		<SwitchField
			control={control}
			name="show_admin_column"
			label="Show a column in the post list"
			description="Add a column for these terms to the entry list table."
		/>
	)
}

export function TaxonomyAdminFields({ control }: { control: Ctrl }) {
	return (
		<>
			<TaxonomyShowUiField control={control} />
			<TaxonomyShowInMenuField control={control} />
			<TaxonomyMetaBoxField control={control} />
			<TaxonomyShowInNavMenusField control={control} />
			<TaxonomyShowTagcloudField control={control} />
			<TaxonomyShowInQuickEditField control={control} />
			<TaxonomyShowAdminColumnField control={control} />
		</>
	)
}

export function TaxonomyApiFields({ control }: { control: Ctrl }) {
	return (
		<SwitchField
			control={control}
			name="publicly_queryable"
			label="Publicly queryable"
			description="Allow terms to be requested directly through public URL query variables."
		/>
	)
}

export function TaxonomyLabelFields({ control }: { control: Ctrl }) {
	const singular = useWatch({ control, name: "singular_label" })
	const plural = useWatch({ control, name: "plural_label" })
	const generatedLabels = useMemo(() => taxonomyGeneratedLabels(singular ?? "", plural ?? ""), [singular, plural])

	return (
		<>
			{LABEL_OVERRIDES.map(([key, label]) => (
				<TextInputField key={key} control={control} name={`labels.${key}`} label={label} placeholder={generatedLabels[key] || undefined} />
			))}
		</>
	)
}

/** Keep blank taxonomy label-override fields tracking the generated labels. */
export function useTaxonomyLabelSync(form: UseFormReturn<TaxonomyRegistrationInput, unknown, TaxonomyRegistrationOutput>): void {
	const singular = useWatch({ control: form.control, name: "singular_label" })
	const plural = useWatch({ control: form.control, name: "plural_label" })
	const generatedLabels = useMemo(() => taxonomyGeneratedLabels(singular ?? "", plural ?? ""), [singular, plural])

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

/** Renders nothing; mounts {@link useTaxonomyLabelSync} so it can be gated behind Kizlo-owned. */
export function TaxonomyLabelSync({ form }: { form: UseFormReturn<TaxonomyRegistrationInput, unknown, TaxonomyRegistrationOutput> }): null {
	useTaxonomyLabelSync(form)
	return null
}
