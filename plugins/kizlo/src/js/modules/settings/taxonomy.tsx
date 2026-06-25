import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useParams } from "react-router-dom"
import { getContent } from "@/modules/settings/shared/content"
import { SwitchField } from "@/modules/settings/shared/fields"
import { NotFound } from "@/modules/settings/shared/not-found"
import { SettingsGroup, SettingsSet } from "@/modules/settings/shared/settings"
import { VariableField } from "@/modules/settings/shared/variable-field"
import { type TaxonomySettingsInput, type TaxonomySettingsOutput, TaxonomySettingsSchema } from "@/shared/lib/schema"
import { useSettings } from "@/shared/lib/settings"
import { Card, CardContent } from "@/shared/ui/card"
import { FieldGroup, FieldSeparator } from "@/shared/ui/field"

export function TaxonomySettingsPage() {
	const params = useParams<{ slug: string }>()
	const { settings, update, isLoading } = useSettings()
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
		},
	})

	if (!taxonomy) return <NotFound />

	const onSubmit = (data: TaxonomySettingsOutput) => {
		update("taxonomies", taxonomy.slug, data)
	}

	const isSeoSupported = form.watch("seo_enabled")
	const content = getContent({ name: taxonomy.name })

	return (
		<form key={params.slug} onSubmit={form.handleSubmit(onSubmit)} className="relative">
			<SettingsSet isLoading={isLoading}>
				{/* ── URL Structure ── */}
				<SettingsGroup heading={content.url.heading} description={content.url.description}>
					<Card>
						<CardContent>
							<FieldGroup>
								<VariableField
									name="pathname_structure"
									label={content.url.pathname.label}
									control={form.control}
									variables={settings?.constants.post_type.path_variables ?? []}
									description={content.url.pathname.description}
								/>
							</FieldGroup>
						</CardContent>
					</Card>
				</SettingsGroup>

				<FieldSeparator />

				{/* ── SEO ── */}
				<SettingsGroup heading={content.seo.heading} description={content.seo.description}>
					<Card>
						<CardContent>
							<FieldGroup>
								<SwitchField
									control={form.control}
									name="seo_enabled"
									label={content.seo.enabled.label}
									description={content.seo.enabled.description}
								/>
							</FieldGroup>
						</CardContent>
					</Card>

					{isSeoSupported && (
						<>
							<Card>
								<CardContent>
									<FieldGroup>
										<VariableField
											control={form.control}
											name="title_structure"
											label={content.seo.title.label}
											placeholder={settings?.constants.post_type.default_title_format}
											description={content.seo.title.description}
											variables={settings?.constants.post_type.content_variables ?? []}
											variant="text"
										/>

										<VariableField
											variant="textarea"
											control={form.control}
											name="description_structure"
											label={content.seo.description_.label}
											placeholder={settings?.constants.post_type.default_desc_format}
											description={content.seo.description_.description}
											variables={settings?.constants.post_type.content_variables ?? []}
										/>
									</FieldGroup>
								</CardContent>
							</Card>

							<Card>
								<CardContent>
									<FieldGroup>
										<SwitchField
											name="search_engine_visibility"
											control={form.control}
											label={content.seo.visibility.label}
											description={content.seo.visibility.description}
										/>
									</FieldGroup>
								</CardContent>
							</Card>
						</>
					)}
				</SettingsGroup>

				{!taxonomy.internal && (
					<>
						<FieldSeparator />

						{/* ── Access Control ── */}
						<SettingsGroup heading={content.access.heading} description={content.access.description}>
							<Card>
								<CardContent>
									<FieldGroup>
										<SwitchField
											control={form.control}
											name="rest_api_enabled"
											label={content.access.enabled.label}
											description={content.access.enabled.description}
										/>
									</FieldGroup>
								</CardContent>
							</Card>
						</SettingsGroup>
					</>
				)}
			</SettingsSet>
		</form>
	)
}
