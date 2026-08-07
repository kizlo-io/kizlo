import { useEffect, useMemo, useRef } from "react"
import { type UseFormReturn, useWatch } from "react-hook-form"
import { ComboboxField, SelectField, type SelectOption, SwitchField, TextareaInputField, TextInputField } from "@/shared/components/fields"
import { SettingsCard, SettingsGroup, SettingsSection } from "@/shared/components/settings"
import type { TaxonomyRegistrationInput, TaxonomyRegistrationOutput } from "@/shared/lib/schema"
import { REG_ADMIN_UI, REG_API, REG_DEFAULT_TERM, REG_DETAILS, REG_LABELS, REG_URLS } from "../nav-model"
import { taxonomyGeneratedLabels } from "./lib"

type TaxonomyForm = UseFormReturn<TaxonomyRegistrationInput, unknown, TaxonomyRegistrationOutput>

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

export function TaxonomyRegistrationFields({ form, postTypeOptions }: { form: TaxonomyForm; postTypeOptions: SelectOption[] }) {
	const { control } = form
	const rewriteEnabled = useWatch({ control, name: "rewrite_enabled" })
	const singularLabel = useWatch({ control, name: "singular_label" })
	const pluralLabel = useWatch({ control, name: "plural_label" })
	const generatedLabels = useMemo(() => taxonomyGeneratedLabels(singularLabel ?? "", pluralLabel ?? ""), [singularLabel, pluralLabel])

	const previousLabels = useRef<Record<string, string>>({})
	useEffect(() => {
		const { setValue, getValues } = form
		for (const [key] of LABEL_OVERRIDES) {
			const next = generatedLabels[key] ?? ""
			const path = `labels.${key}` as const
			const current = getValues(path)
			// Fill blanks and keep untouched fields tracking the names; never clobber a manual edit.
			if (current === undefined || current === "" || current === previousLabels.current[key]) {
				setValue(path, next, { shouldDirty: false })
			}
			previousLabels.current[key] = next
		}
	}, [form, generatedLabels])

	return (
		<>
			<SettingsGroup id={REG_DETAILS} title="Details" desc="How this taxonomy is named, which post types use it, and how its terms behave.">
				<SettingsCard>
					<TextInputField control={control} name="singular_label" label="Singular label" placeholder="Genre" />
					<TextInputField control={control} name="plural_label" label="Plural label" placeholder="Genres" />
					<TextareaInputField control={control} name="description" label="Description" />
					<SwitchField
						control={control}
						name="active"
						label="Active"
						description="Register this taxonomy with WordPress and include it in Kizlo."
					/>
					<SwitchField control={control} name="public" label="Public" description="Show terms on the site and make them queryable." />
					<SwitchField
						control={control}
						name="hierarchical"
						label="Hierarchical"
						description="Allow parent/child terms, like categories."
					/>
				</SettingsCard>

				<SettingsCard>
					<ComboboxField control={control} name="object_types" label="Connected post types" options={postTypeOptions} multiple />
					<SwitchField
						control={control}
						name="sort"
						label="Remember term order"
						description="Preserve the order terms are added to an entry."
					/>
				</SettingsCard>
			</SettingsGroup>

			<SettingsGroup
				id={REG_DEFAULT_TERM}
				title="Default term"
				desc="Optional. A term created with the taxonomy and applied when none is selected."
			>
				<SettingsCard>
					<TextInputField control={control} name="default_term_name" label="Name" />
					<TextInputField control={control} name="default_term_slug" label="Slug" />
					<TextareaInputField control={control} name="default_term_description" label="Description" />
				</SettingsCard>
			</SettingsGroup>

			<SettingsSection id={REG_ADMIN_UI} title="Admin UI" desc="Where and how this taxonomy appears in wp-admin.">
				<SwitchField control={control} name="show_ui" label="Show admin UI" />
				<SwitchField control={control} name="show_in_menu" label="Show in admin menu" />
				<SelectField control={control} name="meta_box" label="Editor control" options={META_BOX_OPTIONS} />
				<SwitchField control={control} name="show_in_nav_menus" label="Available in navigation menus" />
				<SwitchField control={control} name="show_tagcloud" label="Available in the tag cloud widget" />
				<SwitchField control={control} name="show_in_quick_edit" label="Show in Quick Edit" />
				<SwitchField control={control} name="show_admin_column" label="Show a column in the post list" />
			</SettingsSection>

			<SettingsSection
				id={REG_URLS}
				title="URLs"
				desc="WordPress rewrite rules for this taxonomy. These are separate from Kizlo's headless pathname settings."
			>
				<SwitchField control={control} name="rewrite_enabled" label="Enable pretty permalinks" />
				{rewriteEnabled ? (
					<>
						<TextInputField control={control} name="rewrite_slug" label="URL slug" description="Defaults to the key." />
						<SwitchField control={control} name="rewrite_with_front" label="Prepend the permalink front" />
						<SwitchField control={control} name="rewrite_hierarchical" label="Hierarchical term URLs" />
					</>
				) : null}
			</SettingsSection>

			<SettingsSection id={REG_API} title="API" desc="How terms are exposed over REST. show_in_rest is always enabled.">
				<SwitchField control={control} name="publicly_queryable" label="Publicly queryable" />
				<TextInputField
					control={control}
					name="rest_base"
					label="REST base"
					description="Override the REST route segment. Defaults to the key."
				/>
			</SettingsSection>

			<SettingsSection
				id={REG_LABELS}
				title="Label overrides"
				desc="Optional. Leave blank to use labels generated from the singular and plural names."
			>
				{LABEL_OVERRIDES.map(([key, label]) => (
					<TextInputField
						key={key}
						control={control}
						name={`labels.${key}`}
						label={label}
						placeholder={generatedLabels[key] || undefined}
					/>
				))}
			</SettingsSection>
		</>
	)
}
