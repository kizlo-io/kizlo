import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { getContent } from "@/modules/settings/shared/content"
import { SwitchField } from "@/modules/settings/shared/fields"
import { SettingsGroup, SettingsSet } from "@/modules/settings/shared/settings"
import { VariableField } from "@/modules/settings/shared/variable-field"
import { type AuthorSettingsInput, type AuthorSettingsOutput, AuthorSettingsSchema } from "@/shared/lib/schema"
import { useSettings } from "@/shared/lib/settings"
import { Card, CardContent } from "@/shared/ui/card"
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSeparator } from "@/shared/ui/field"
import { Switch } from "@/shared/ui/switch"
export function AuthorsSettingsPage() {
	const { settings, update, isLoading } = useSettings()

	const form = useForm<AuthorSettingsInput, unknown, AuthorSettingsOutput>({
		resolver: zodResolver(AuthorSettingsSchema),
		defaultValues: {
			pathname_structure: settings?.authors.pathname_structure ?? "",
			enabled: settings?.authors.enabled ?? false,
			title_structure: settings?.authors.title_structure ?? "",
			description_structure: settings?.authors.description_structure ?? "",
			search_engine_visibility: settings?.authors.search_engine_visibility ?? false,
		},
	})

	const content = getContent({ name: "Authors" })

	function onSubmit(data: AuthorSettingsOutput) {
		update("authors", data)
	}

	const isSeoSupported = true

	return (
		<form onSubmit={form.handleSubmit(onSubmit)} className="relative">
			<SettingsSet isLoading={isLoading}>
				{/* ── Authors ── */}
				<SettingsGroup
					heading={<>Authors</>}
					description={
						<>
							Manage the URL structure and SEO configuration for author archive pages, including title templates, meta descriptions, and
							search visibility.
						</>
					}
				>
					<Card>
						<CardContent>
							<Controller
								name="enabled"
								control={form.control}
								render={({ field, fieldState }) => (
									<Field orientation="horizontal" data-invalid={fieldState.invalid}>
										<FieldContent>
											<FieldLabel htmlFor="enabled">Enable author archives</FieldLabel>
											<FieldDescription>
												When disabled, author archive pages will redirect to the homepage and will not be indexed by search engines. Enable
												this if you want each author to have a publicly accessible archive of their posts.
											</FieldDescription>
										</FieldContent>
										<Switch id="enabled" checked={field.value} onCheckedChange={field.onChange} aria-invalid={fieldState.invalid} />
										{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
									</Field>
								)}
							/>
						</CardContent>
					</Card>

					<Card>
						<CardContent>
							<FieldGroup>
								<VariableField
									control={form.control}
									name="pathname_structure"
									label={content.url.pathname.label}
									variables={settings?.constants.author.path_variables ?? []}
									description={content.url.pathname.description}
								/>
							</FieldGroup>
						</CardContent>
					</Card>
				</SettingsGroup>

				<FieldSeparator />

				{/* ── SEO ── */}
				<SettingsGroup heading={content.seo.heading} description={content.seo.description}>
					{/* <Card>
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
					</Card> */}

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
			</SettingsSet>
		</form>
	)
}
