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
import { PostTypeRegistrationFields } from "./post-type-fields"
import { TaxonomyRegistrationFields } from "./taxonomy-fields"

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

			<PostTypeRegistrationFields form={form} taxonomyOptions={taxonomyOptions} />
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

			<TaxonomyRegistrationFields form={form} postTypeOptions={postTypeOptions} />
		</SettingsForm>
	)
}
