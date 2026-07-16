import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useParams } from "react-router-dom"
import { getContent } from "@/modules/settings/shared/content"
import { NotFound } from "@/modules/settings/shared/not-found"
import { RestApiSection } from "@/modules/settings/shared/rest-api-section"
import { BreadcrumbsField } from "@/shared/components/breadcrumbs-field"
import { SwitchField } from "@/shared/components/fields"
import { SettingsForm, SettingsSection } from "@/shared/components/settings"
import { VariableField } from "@/shared/components/variable-field"
import { type TaxonomySettingsInput, type TaxonomySettingsOutput, TaxonomySettingsSchema } from "@/shared/lib/schema"
import { useSettings, useSettingsForm } from "@/shared/lib/settings"

export function TaxonomySettingsPage() {
	const params = useParams<{ slug: string }>()
	const { settings } = useSettings()
	const taxonomy = settings?.taxonomies.find((a) => a.slug === params.slug)

	const form = useForm<TaxonomySettingsInput, unknown, TaxonomySettingsOutput>({
		resolver: zodResolver(TaxonomySettingsSchema),
		values: {
			pathname_structure: taxonomy?.pathname_structure ?? "",
			title_structure: taxonomy?.title_structure ?? "",
			description_structure: taxonomy?.description_structure ?? "",
			search_engine_visibility: taxonomy?.search_engine_visibility ?? false,
			rest_api_enabled: taxonomy?.rest_api_enabled ?? false,
			seo_enabled: taxonomy?.seo_enabled ?? false,
			breadcrumbs: (taxonomy?.breadcrumbs ?? []).map(String),
		},
	})

	const formProps = useSettingsForm("taxonomies", taxonomy?.slug ?? "", form)

	if (!taxonomy) return <NotFound />

	const isSeoSupported = form.watch("seo_enabled")
	const content = getContent({ name: taxonomy.name })

	return (
		<SettingsForm key={params.slug} {...formProps}>
			<SettingsSection title={content.url.heading} desc={content.url.description}>
				<VariableField
					name="pathname_structure"
					label={content.url.pathname.label}
					control={form.control}
					variables={settings?.constants.taxonomy.path_variables ?? []}
					description={content.url.pathname.description}
				/>
			</SettingsSection>

			<SettingsSection title={content.seo.heading} desc={content.seo.description}>
				<SwitchField
					control={form.control}
					name="seo_enabled"
					label={content.seo.enabled.label}
					description={content.seo.enabled.description}
				/>

				{isSeoSupported ? (
					<>
						<VariableField
							control={form.control}
							name="title_structure"
							label={content.seo.title.label}
							placeholder={settings?.constants.taxonomy.default_title_format}
							description={content.seo.title.description}
							variables={settings?.constants.taxonomy.content_variables ?? []}
							variant="text"
						/>

						<VariableField
							variant="textarea"
							control={form.control}
							name="description_structure"
							label={content.seo.description_.label}
							placeholder={settings?.constants.taxonomy.default_desc_format}
							description={content.seo.description_.description}
							variables={settings?.constants.taxonomy.content_variables ?? []}
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
									The crumbs between <strong>Home</strong> and the current term. Add pages, or the dynamic <strong>Parent</strong> slot
									(expands to parent terms). Order matters — reorder with the arrows. Leave empty for <strong>Home → current</strong>.
								</>
							}
						/>
					</>
				) : null}
			</SettingsSection>

			<RestApiSection control={form.control} access={content.access} internal={taxonomy.internal} />
		</SettingsForm>
	)
}
