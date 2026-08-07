import { zodResolver } from "@hookform/resolvers/zod"
import type { PostTypeRegistration, TaxonomyRegistration } from "@kizlo/shared"
import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import type { SelectOption } from "@/shared/components/fields"
import { SettingsForm } from "@/shared/components/settings"
import {
	type PostTypeRegistrationInput,
	type PostTypeRegistrationOutput,
	PostTypeRegistrationSchema,
	type TaxonomyRegistrationInput,
	type TaxonomyRegistrationOutput,
	TaxonomyRegistrationSchema,
} from "@/shared/lib/schema"
import { apiErrorMessage, postTypeRegistrationValues, taxonomyRegistrationValues, updateRegistration } from "./lib"
import { PostTypeRegistrationFields } from "./post-type-fields"
import { TaxonomyRegistrationFields } from "./taxonomy-fields"

export function PostTypeRegistrationSection({
	slug,
	registration,
	taxonomyOptions,
}: {
	slug: string
	registration: PostTypeRegistration
	taxonomyOptions: SelectOption[]
}) {
	const [isLoading, setLoading] = useState(false)
	const values = useMemo(() => postTypeRegistrationValues(registration), [registration])

	const form = useForm<PostTypeRegistrationInput, unknown, PostTypeRegistrationOutput>({
		resolver: zodResolver(PostTypeRegistrationSchema),
		values,
	})

	const onSubmit = form.handleSubmit(async (data) => {
		setLoading(true)
		try {
			await updateRegistration("post_types", slug, data)
			toast.success("Registration saved.")
			form.reset(form.getValues())
		} catch (error) {
			toast.error(apiErrorMessage(error, "Could not save the registration."))
		} finally {
			setLoading(false)
		}
	})

	return (
		<SettingsForm
			key={slug}
			isLoading={isLoading}
			isDirty={form.formState.isDirty}
			submitLabel="Save registration"
			onSubmit={onSubmit}
			onCancel={() => form.reset()}
		>
			<PostTypeRegistrationFields form={form} taxonomyOptions={taxonomyOptions} />
		</SettingsForm>
	)
}

export function TaxonomyRegistrationSection({
	slug,
	registration,
	postTypeOptions,
}: {
	slug: string
	registration: TaxonomyRegistration
	postTypeOptions: SelectOption[]
}) {
	const [isLoading, setLoading] = useState(false)
	const values = useMemo(() => taxonomyRegistrationValues(registration), [registration])

	const form = useForm<TaxonomyRegistrationInput, unknown, TaxonomyRegistrationOutput>({
		resolver: zodResolver(TaxonomyRegistrationSchema),
		values,
	})

	const onSubmit = form.handleSubmit(async (data) => {
		setLoading(true)
		try {
			await updateRegistration("taxonomies", slug, data)
			toast.success("Registration saved.")
			form.reset(form.getValues())
		} catch (error) {
			toast.error(apiErrorMessage(error, "Could not save the registration."))
		} finally {
			setLoading(false)
		}
	})

	return (
		<SettingsForm
			key={slug}
			isLoading={isLoading}
			isDirty={form.formState.isDirty}
			submitLabel="Save registration"
			onSubmit={onSubmit}
			onCancel={() => form.reset()}
		>
			<TaxonomyRegistrationFields form={form} postTypeOptions={postTypeOptions} />
		</SettingsForm>
	)
}
