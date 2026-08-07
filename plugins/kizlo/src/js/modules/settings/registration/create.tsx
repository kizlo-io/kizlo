import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect, useMemo, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { FieldError, type SelectOption } from "@/shared/components/fields"
import { SettingsForm, SettingsSection } from "@/shared/components/settings"
import { TextInput } from "@/shared/components/ui/input"
import {
	CreatePostTypeRegistrationSchema,
	CreateTaxonomyRegistrationSchema,
	type PostTypeRegistrationInput,
	type PostTypeRegistrationOutput,
	PostTypeRegistrationSchema,
	type TaxonomyRegistrationInput,
	type TaxonomyRegistrationOutput,
	TaxonomyRegistrationSchema,
} from "@/shared/lib/schema"
import { useSettings } from "@/shared/lib/settings"
import { apiErrorMessage, createRegistration, generateKey, postTypeRegistrationValues, taxonomyRegistrationValues } from "./lib"
import {
	PostTypeAdminFields,
	PostTypeApiFields,
	PostTypeBasicsFields,
	PostTypeCapabilityFields,
	PostTypeEditorFields,
	PostTypeExcludeFromSearchField,
	PostTypeLabelFields,
	usePostTypeLabelSync,
} from "./post-type-cards"
import {
	TaxonomyAdminFields,
	TaxonomyApiFields,
	TaxonomyBasicsFields,
	TaxonomyContentFields,
	TaxonomyDefaultTermFields,
	TaxonomyLabelFields,
	TaxonomySortField,
	useTaxonomyLabelSync,
} from "./taxonomy-cards"

function toOptions(items: { slug: string; name: string }[]): SelectOption[] {
	return items.map((item) => ({ value: item.slug, label: item.name }))
}

export function CreatePostTypePage() {
	const navigate = useNavigate()
	const { settings } = useSettings()
	const [isLoading, setLoading] = useState(false)
	const [key, setKey] = useState("")
	const [keyError, setKeyError] = useState<string>()
	const keyTouched = useRef(false)

	const form = useForm<PostTypeRegistrationInput, unknown, PostTypeRegistrationOutput>({
		resolver: zodResolver(PostTypeRegistrationSchema),
		defaultValues: postTypeRegistrationValues(null),
	})

	usePostTypeLabelSync(form)

	const singular = form.watch("singular_label")

	useEffect(() => {
		if (!keyTouched.current) setKey(generateKey(singular ?? "", 20))
	}, [singular])

	const taxonomyOptions = useMemo(() => toOptions(settings?.taxonomies ?? []), [settings])

	const onSubmit = form.handleSubmit(async (data) => {
		const parsed = CreatePostTypeRegistrationSchema.shape.key.safeParse(key.trim())
		if (!parsed.success) {
			setKeyError(parsed.error.issues[0]?.message ?? "Invalid key.")
			return
		}

		setLoading(true)
		try {
			const result = await createRegistration("post_types", { ...data, key: parsed.data })
			toast.success("Post type created.")
			if (result.restored) toast.info("Restored previously retained Kizlo settings for this key.")
			navigate(`/post-types/${result.slug}`)
		} catch (error) {
			toast.error(apiErrorMessage(error, "Could not create the post type. Check the key is valid and unique."))
		} finally {
			setLoading(false)
		}
	})

	return (
		<SettingsForm
			isDirty
			isLoading={isLoading}
			submitLabel="Create post type"
			onSubmit={onSubmit}
			onCancel={() => navigate("/general/site")}
		>
			<SettingsSection title="New post type" desc="The key is generated from the singular label and locked once created.">
				<div>
					<TextInput
						name="key"
						label="Key"
						desc="Lowercase letters, numbers, hyphens, and underscores. Up to 20 characters."
						value={key}
						placeholder="book"
						onChange={(value) => {
							keyTouched.current = true
							setKeyError(undefined)
							setKey(value)
						}}
					/>
					<FieldError message={keyError} />
				</div>
			</SettingsSection>

			<SettingsSection title="Basics" desc="How this post type is named and how its entries behave.">
				<PostTypeBasicsFields control={form.control} />
			</SettingsSection>

			<SettingsSection title="Editor & data" desc="What the editor exposes and how entries connect to taxonomies.">
				<PostTypeEditorFields control={form.control} taxonomyOptions={taxonomyOptions} />
			</SettingsSection>

			<SettingsSection title="Admin UI" desc="Where and how this post type appears in wp-admin.">
				<PostTypeAdminFields control={form.control} />
				<PostTypeExcludeFromSearchField control={form.control} />
			</SettingsSection>

			<SettingsSection title="API" desc="How entries are exposed over REST. show_in_rest is always enabled.">
				<PostTypeApiFields control={form.control} />
			</SettingsSection>

			<SettingsSection title="Capabilities" desc="Which capabilities gate managing these entries.">
				<PostTypeCapabilityFields control={form.control} />
			</SettingsSection>

			<SettingsSection title="Label overrides" desc="Optional. Leave blank to use labels generated from the singular and plural names.">
				<PostTypeLabelFields control={form.control} />
			</SettingsSection>
		</SettingsForm>
	)
}

export function CreateTaxonomyPage() {
	const navigate = useNavigate()
	const { settings } = useSettings()
	const [isLoading, setLoading] = useState(false)
	const [key, setKey] = useState("")
	const [keyError, setKeyError] = useState<string>()
	const keyTouched = useRef(false)

	const form = useForm<TaxonomyRegistrationInput, unknown, TaxonomyRegistrationOutput>({
		resolver: zodResolver(TaxonomyRegistrationSchema),
		defaultValues: taxonomyRegistrationValues(null),
	})

	useTaxonomyLabelSync(form)

	const singular = form.watch("singular_label")

	useEffect(() => {
		if (!keyTouched.current) setKey(generateKey(singular ?? "", 32))
	}, [singular])

	const postTypeOptions = useMemo(() => toOptions(settings?.post_types ?? []), [settings])

	const onSubmit = form.handleSubmit(async (data) => {
		const parsed = CreateTaxonomyRegistrationSchema.shape.key.safeParse(key.trim())
		if (!parsed.success) {
			setKeyError(parsed.error.issues[0]?.message ?? "Invalid key.")
			return
		}

		setLoading(true)
		try {
			const result = await createRegistration("taxonomies", { ...data, key: parsed.data })
			toast.success("Taxonomy created.")
			if (result.restored) toast.info("Restored previously retained Kizlo settings for this key.")
			navigate(`/taxonomies/${result.slug}`)
		} catch (error) {
			toast.error(apiErrorMessage(error, "Could not create the taxonomy. Check the key is valid and unique."))
		} finally {
			setLoading(false)
		}
	})

	return (
		<SettingsForm
			isDirty
			isLoading={isLoading}
			submitLabel="Create taxonomy"
			onSubmit={onSubmit}
			onCancel={() => navigate("/general/site")}
		>
			<SettingsSection title="New taxonomy" desc="The key is generated from the singular label and locked once created.">
				<div>
					<TextInput
						name="key"
						label="Key"
						desc="Lowercase letters, numbers, hyphens, and underscores. Up to 32 characters."
						value={key}
						placeholder="genre"
						onChange={(value) => {
							keyTouched.current = true
							setKeyError(undefined)
							setKey(value)
						}}
					/>
					<FieldError message={keyError} />
				</div>
			</SettingsSection>

			<SettingsSection title="Basics" desc="How this taxonomy is named and how its terms behave.">
				<TaxonomyBasicsFields control={form.control} />
			</SettingsSection>

			<SettingsSection title="Content" desc="Which post types use this taxonomy and how its terms behave.">
				<TaxonomyContentFields control={form.control} postTypeOptions={postTypeOptions} />
				<TaxonomySortField control={form.control} />
			</SettingsSection>

			<SettingsSection title="Default term" desc="Optional. A term created with the taxonomy and applied when none is selected.">
				<TaxonomyDefaultTermFields control={form.control} />
			</SettingsSection>

			<SettingsSection title="Admin UI" desc="Where and how this taxonomy appears in wp-admin.">
				<TaxonomyAdminFields control={form.control} />
			</SettingsSection>

			<SettingsSection title="API" desc="How terms are exposed over REST. show_in_rest is always enabled.">
				<TaxonomyApiFields control={form.control} />
			</SettingsSection>

			<SettingsSection title="Label overrides" desc="Optional. Leave blank to use labels generated from the singular and plural names.">
				<TaxonomyLabelFields control={form.control} />
			</SettingsSection>
		</SettingsForm>
	)
}
