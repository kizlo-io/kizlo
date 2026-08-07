import { useEffect, useMemo, useRef } from "react"
import { type UseFormReturn, useWatch } from "react-hook-form"
import {
	ComboboxField,
	NumberInputField,
	SelectField,
	type SelectOption,
	SwitchField,
	TextareaInputField,
	TextInputField,
} from "@/shared/components/fields"
import { SettingsCard, SettingsGroup, SettingsSection } from "@/shared/components/settings"
import type { PostTypeRegistrationInput, PostTypeRegistrationOutput } from "@/shared/lib/schema"
import { REG_ADMIN_UI, REG_API, REG_CAPABILITIES, REG_DETAILS, REG_LABELS, REG_URLS } from "../nav-model"
import { postTypeGeneratedLabels } from "./lib"

type PostTypeForm = UseFormReturn<PostTypeRegistrationInput, unknown, PostTypeRegistrationOutput>

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

const ARCHIVE_OPTIONS: SelectOption[] = [
	{ value: "default", label: "Default archive" },
	{ value: "disabled", label: "No archive" },
	{ value: "custom", label: "Custom slug" },
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

export function PostTypeRegistrationFields({ form, taxonomyOptions }: { form: PostTypeForm; taxonomyOptions: SelectOption[] }) {
	const { control } = form
	const rewriteEnabled = useWatch({ control, name: "rewrite_enabled" })
	const archive = useWatch({ control, name: "archive" })
	const capabilityType = useWatch({ control, name: "capability_type" })
	const showInMenu = useWatch({ control, name: "show_in_menu" })
	const singularLabel = useWatch({ control, name: "singular_label" })
	const pluralLabel = useWatch({ control, name: "plural_label" })
	const generatedLabels = useMemo(() => postTypeGeneratedLabels(singularLabel ?? "", pluralLabel ?? ""), [singularLabel, pluralLabel])

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
			<SettingsGroup
				id={REG_DETAILS}
				title="Details"
				desc="How this post type is named, what its editor exposes, and how its entries behave."
			>
				<SettingsCard>
					<TextInputField control={control} name="singular_label" label="Singular label" placeholder="Book" />
					<TextInputField control={control} name="plural_label" label="Plural label" placeholder="Books" />
					<TextareaInputField control={control} name="description" label="Description" />
					<SwitchField
						control={control}
						name="active"
						label="Active"
						description="Register this post type with WordPress and include it in Kizlo."
					/>
					<SwitchField control={control} name="public" label="Public" description="Show entries on the site and make them queryable." />
					<SwitchField control={control} name="hierarchical" label="Hierarchical" description="Allow parent/child entries, like pages." />
				</SettingsCard>

				<SettingsCard>
					<ComboboxField control={control} name="supports" label="Editor supports" options={SUPPORTS_OPTIONS} multiple />
					<ComboboxField control={control} name="taxonomies" label="Connected taxonomies" options={taxonomyOptions} multiple />
					<SwitchField control={control} name="can_export" label="Allow export" />
					<SwitchField control={control} name="delete_with_user" label="Delete entries with their author" />
				</SettingsCard>
			</SettingsGroup>

			<SettingsSection id={REG_ADMIN_UI} title="Admin UI" desc="Where and how this post type appears in wp-admin.">
				<SwitchField control={control} name="show_ui" label="Show admin UI" />
				<SwitchField control={control} name="show_in_menu" label="Show in admin menu" />
				{showInMenu ? (
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
				) : null}
				<SwitchField control={control} name="show_in_admin_bar" label="Show in admin bar" />
				<SwitchField control={control} name="show_in_nav_menus" label="Available in navigation menus" />
				<SwitchField control={control} name="exclude_from_search" label="Exclude from site search" />
			</SettingsSection>

			<SettingsGroup
				id={REG_URLS}
				title="URLs"
				desc="WordPress rewrite rules for this post type. These are separate from Kizlo's headless pathname settings."
			>
				<SettingsCard>
					<SwitchField control={control} name="rewrite_enabled" label="Enable pretty permalinks" />
					{rewriteEnabled ? (
						<>
							<TextInputField control={control} name="rewrite_slug" label="URL slug" description="Defaults to the key." />
							<SwitchField control={control} name="rewrite_with_front" label="Prepend the permalink front" />
							<SwitchField control={control} name="rewrite_feeds" label="Enable feeds" />
							<SwitchField control={control} name="rewrite_pages" label="Enable pagination" />
						</>
					) : null}
				</SettingsCard>

				<SettingsCard>
					<SelectField control={control} name="archive" label="Archive" options={ARCHIVE_OPTIONS} />
					{archive === "custom" ? <TextInputField control={control} name="archive_slug" label="Archive slug" /> : null}
				</SettingsCard>
			</SettingsGroup>

			<SettingsSection id={REG_API} title="API" desc="How entries are exposed over REST. show_in_rest is always enabled.">
				<SwitchField control={control} name="publicly_queryable" label="Publicly queryable" />
				<TextInputField
					control={control}
					name="rest_base"
					label="REST base"
					description="Override the REST route segment. Defaults to the key."
				/>
			</SettingsSection>

			<SettingsSection id={REG_CAPABILITIES} title="Capabilities" desc="Which capabilities gate managing these entries.">
				<SelectField control={control} name="capability_type" label="Capability preset" options={CAPABILITY_OPTIONS} />
				{capabilityType === "custom" ? (
					<>
						<TextInputField control={control} name="capability_singular" label="Singular capability name" placeholder="book" />
						<TextInputField control={control} name="capability_plural" label="Plural capability name" placeholder="books" />
					</>
				) : null}
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
