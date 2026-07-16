import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { getContent } from "@/modules/settings/shared/content"
import { BreadcrumbsField } from "@/shared/components/breadcrumbs-field"
import { SwitchField } from "@/shared/components/fields"
import { SettingsForm, SettingsSection } from "@/shared/components/settings"
import { VariableField } from "@/shared/components/variable-field"
import { type AuthorSettingsInput, type AuthorSettingsOutput, AuthorSettingsSchema } from "@/shared/lib/schema"
import { useSettings, useSettingsForm } from "@/shared/lib/settings"

export function AuthorsSettingsPage() {
	const { settings } = useSettings()

	const form = useForm<AuthorSettingsInput, unknown, AuthorSettingsOutput>({
		resolver: zodResolver(AuthorSettingsSchema),
		defaultValues: {
			pathname_structure: settings?.authors.pathname_structure ?? "",
			enabled: settings?.authors.enabled ?? false,
			title_structure: settings?.authors.title_structure ?? "",
			description_structure: settings?.authors.description_structure ?? "",
			search_engine_visibility: settings?.authors.search_engine_visibility ?? false,
			breadcrumbs: (settings?.authors.breadcrumbs ?? []).map(String),
		},
	})

	const content = getContent({ name: "Authors" })

	return (
		<SettingsForm {...useSettingsForm("authors", form)}>
			<SettingsSection
				title="Authors"
				desc="Manage the URL structure and SEO configuration for author archive pages, including title templates, meta descriptions, and search visibility."
			>
				<SwitchField
					control={form.control}
					name="enabled"
					label="Enable author archives"
					description="When disabled, author archive pages will redirect to the homepage and will not be indexed by search engines."
				/>

				<VariableField
					control={form.control}
					name="pathname_structure"
					label={content.url.pathname.label}
					variables={settings?.constants.author.path_variables ?? []}
					description={content.url.pathname.description}
				/>
			</SettingsSection>

			<SettingsSection title={content.seo.heading} desc={content.seo.description}>
				<VariableField
					control={form.control}
					name="title_structure"
					label={content.seo.title.label}
					placeholder={settings?.constants.author.default_title_format}
					description={content.seo.title.description}
					variables={settings?.constants.author.content_variables ?? []}
					variant="text"
				/>

				<VariableField
					variant="textarea"
					control={form.control}
					name="description_structure"
					label={content.seo.description_.label}
					placeholder={settings?.constants.author.default_desc_format}
					description={content.seo.description_.description}
					variables={settings?.constants.author.content_variables ?? []}
				/>

				<SwitchField
					name="search_engine_visibility"
					control={form.control}
					label={content.seo.visibility.label}
					description={content.seo.visibility.description}
				/>

				<BreadcrumbsField
					control={form.control}
					name="breadcrumbs"
					label="Breadcrumb trail"
					description={
						<>
							The crumbs between <strong>Home</strong> and the author. Add pages, or the dynamic <strong>Parent</strong> slot. Order matters
							— reorder with the arrows. Leave empty for <strong>Home → author</strong>.
						</>
					}
				/>
			</SettingsSection>
		</SettingsForm>
	)
}
