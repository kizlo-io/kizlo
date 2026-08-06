import { zodResolver } from "@hookform/resolvers/zod"
import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { useParams } from "react-router-dom"
import { CustomFieldsBuilder } from "@/modules/settings/custom-fields/builder"
import { getContent } from "@/modules/settings/shared/content"
import { NotFound } from "@/modules/settings/shared/not-found"
import { RestApiSection } from "@/modules/settings/shared/rest-api-section"
import { BreadcrumbsField } from "@/shared/components/breadcrumbs-field"
import { SwitchField } from "@/shared/components/fields"
import { SettingsCard, SettingsForm, SettingsGroup, SettingsSection } from "@/shared/components/settings"
import { VariableField } from "@/shared/components/variable-field"
import { createTaxonomySettingsSchema, type TaxonomySettingsInput, type TaxonomySettingsOutput } from "@/shared/lib/schema"
import { useSettings, useSettingsForm } from "@/shared/lib/settings"

export function TaxonomySettingsPage() {
	const params = useParams<{ slug: string }>()
	const { settings } = useSettings()
	const taxonomy = settings?.taxonomies.find((a) => a.slug === params.slug)

	const reservedFieldNames = settings?.constants.taxonomy.reserved_field_names
	const schema = useMemo(() => createTaxonomySettingsSchema(reservedFieldNames ?? []), [reservedFieldNames])

	const form = useForm<TaxonomySettingsInput, unknown, TaxonomySettingsOutput>({
		resolver: zodResolver(schema),
		values: {
			pathname_structure: taxonomy?.pathname_structure ?? "",
			title_structure: taxonomy?.title_structure ?? "",
			description_structure: taxonomy?.description_structure ?? "",
			search_engine_visibility: taxonomy?.search_engine_visibility ?? false,
			rest_api_enabled: taxonomy?.rest_api_enabled ?? false,
			seo_enabled: taxonomy?.seo_enabled ?? false,
			breadcrumbs: (taxonomy?.breadcrumbs ?? []).map(String),
			custom_fields: taxonomy?.custom_fields ?? [],
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

			<SettingsSection
				title="Custom fields"
				desc="Define fields editors fill in on each term. Values are exposed at the top level of each term in the API, keyed by field name."
			>
				<CustomFieldsBuilder control={form.control} name="custom_fields" />
			</SettingsSection>

			<SettingsGroup title={content.seo.heading} desc={content.seo.description}>
				<SettingsCard>
					<SwitchField
						control={form.control}
						name="seo_enabled"
						label={content.seo.enabled.label}
						description={content.seo.enabled.description}
					/>
				</SettingsCard>

				{isSeoSupported ? (
					<>
						<SettingsCard>
							<SwitchField
								name="search_engine_visibility"
								control={form.control}
								label={content.seo.visibility.label}
								description={content.seo.visibility.description}
							/>
						</SettingsCard>

						<SettingsCard>
							<VariableField
								control={form.control}
								name="title_structure"
								label={content.meta.title.label}
								placeholder={settings?.constants.taxonomy.default_title_format}
								description={content.meta.title.description}
								variables={settings?.constants.taxonomy.content_variables ?? []}
								variant="text"
							/>

							<VariableField
								variant="textarea"
								control={form.control}
								name="description_structure"
								label={content.meta.description_.label}
								placeholder={settings?.constants.taxonomy.default_desc_format}
								description={content.meta.description_.description}
								variables={settings?.constants.taxonomy.content_variables ?? []}
							/>
						</SettingsCard>

						<SettingsCard>
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
						</SettingsCard>
					</>
				) : null}
			</SettingsGroup>

			<RestApiSection control={form.control} access={content.access} internal={taxonomy.internal} />
		</SettingsForm>
	)
}
