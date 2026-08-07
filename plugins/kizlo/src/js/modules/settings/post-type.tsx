import { zodResolver } from "@hookform/resolvers/zod"
import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { useNavigate, useParams } from "react-router-dom"
import { CustomFieldsBuilder } from "@/modules/settings/custom-fields/builder"
import { DeleteRegistration } from "@/modules/settings/registration/delete-dialog"
import { PostTypeRegistrationSection } from "@/modules/settings/registration/section"
import { ArticleTypeField } from "@/modules/settings/shared/article-type-field"
import { getContent } from "@/modules/settings/shared/content"
import { NotFound } from "@/modules/settings/shared/not-found"
import { PageTypeField } from "@/modules/settings/shared/page-type-field"
import { RestApiSection } from "@/modules/settings/shared/rest-api-section"
import { BreadcrumbsField } from "@/shared/components/breadcrumbs-field"
import { SwitchField } from "@/shared/components/fields"
import { SettingsCard, SettingsForm, SettingsGroup, SettingsSection } from "@/shared/components/settings"
import { VariableField } from "@/shared/components/variable-field"
import { createPostTypeSettingsSchema, type PostTypeSettingsInput, type PostTypeSettingsOutput } from "@/shared/lib/schema"
import { useSettings, useSettingsForm } from "@/shared/lib/settings"
import { REG_DELETE, SECTION_CUSTOM_FIELDS, SECTION_SEO, SECTION_URL } from "./nav-model"

export function PostTypeSettingsPage() {
	const params = useParams<{ slug: string }>()
	const navigate = useNavigate()
	const { settings } = useSettings()
	const postType = settings?.post_types.find((a) => a.slug === params.slug)
	const taxonomyOptions = useMemo(() => (settings?.taxonomies ?? []).map((t) => ({ value: t.slug, label: t.name })), [settings])

	const reservedFieldNames = settings?.constants.post_type.reserved_field_names
	const schema = useMemo(() => createPostTypeSettingsSchema(reservedFieldNames ?? []), [reservedFieldNames])

	const form = useForm<PostTypeSettingsInput, unknown, PostTypeSettingsOutput>({
		resolver: zodResolver(schema),
		values: {
			pathname_structure: postType?.pathname_structure ?? "",
			title_structure: postType?.title_structure ?? "",
			description_structure: postType?.description_structure ?? "",
			search_engine_visibility: postType?.search_engine_visibility ?? false,
			webpage_type: postType?.webpage_type ?? "WebPage",
			article_type: postType?.article_type ?? "Article",
			comment_action_structure: postType?.comment_action_structure ?? "",
			rest_api_enabled: postType?.rest_api_enabled ?? false,
			seo_enabled: postType?.seo_enabled ?? false,
			breadcrumbs: (postType?.breadcrumbs ?? []).map(String),
			custom_fields: postType?.custom_fields ?? [],
		},
	})

	const formProps = useSettingsForm("post_types", postType?.slug ?? "", form)

	if (!postType) return <NotFound />

	const isSeoSupported = form.watch("seo_enabled")
	const isArticleType = form.watch("article_type") !== "none"
	const content = getContent({ name: postType.name ?? "Posts" })

	return (
		<>
			{postType.kizlo_owned && postType.registration ? (
				<PostTypeRegistrationSection slug={postType.slug} registration={postType.registration} taxonomyOptions={taxonomyOptions} />
			) : null}

			<SettingsForm key={params.slug} {...formProps}>
				<SettingsSection id={SECTION_URL} title={content.url.heading} desc={content.url.description}>
					<VariableField
						name="pathname_structure"
						label={content.url.pathname.label}
						control={form.control}
						variables={settings?.constants.post_type.path_variables ?? []}
						description={content.url.pathname.description}
					/>
				</SettingsSection>

				<SettingsSection
					id={SECTION_CUSTOM_FIELDS}
					title="Custom fields"
					desc="Define fields editors fill in on each entry. Values are exposed at the top level of each entry in the API, keyed by field name."
				>
					<CustomFieldsBuilder control={form.control} name="custom_fields" />
				</SettingsSection>

				<SettingsGroup id={SECTION_SEO} title={content.seo.heading} desc={content.seo.description}>
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
									placeholder={settings?.constants.post_type.default_title_format}
									description={content.meta.title.description}
									variables={postType.content_variables}
									variant="text"
								/>

								<VariableField
									variant="textarea"
									control={form.control}
									name="description_structure"
									label={content.meta.description_.label}
									placeholder={settings?.constants.post_type.default_desc_format}
									description={content.meta.description_.description}
									variables={postType.content_variables}
								/>
							</SettingsCard>

							<SettingsCard>
								<PageTypeField control={form.control} name="webpage_type" description={content.schema.pageType.description} />

								<ArticleTypeField control={form.control} name="article_type" description={content.schema.articleType.description} />

								{postType.supports.comments && isArticleType ? (
									<VariableField
										name="comment_action_structure"
										control={form.control}
										label={content.schema.commentUrl.label}
										variables={[
											...(settings?.constants.post_type.path_variables ?? []),
											{ label: "pathname", description: "Resolved pathname of the post.", value: "{{pathname}}" },
										]}
										description={content.schema.commentUrl.description}
									/>
								) : null}
							</SettingsCard>

							<SettingsCard>
								<BreadcrumbsField
									control={form.control}
									name="breadcrumbs"
									label="Breadcrumb trail"
									description={
										<>
											The crumbs between <strong>Home</strong> and the current item. Add pages, or the dynamic <strong>Parent</strong> slot
											(expands to the item's real parents). Order matters — reorder with the arrows. Leave empty for{" "}
											<strong>Home → current</strong>.
										</>
									}
								/>
							</SettingsCard>
						</>
					) : null}
				</SettingsGroup>

				<RestApiSection control={form.control} access={content.access} internal={postType.internal} />

				{postType.kizlo_owned && postType.registration ? (
					<SettingsSection id={REG_DELETE} title="Delete" desc="Permanently remove this Kizlo-owned post type. There is no trash.">
						<DeleteRegistration
							kind="post_types"
							slug={postType.slug}
							name={postType.registration.plural_label || postType.slug}
							onDeleted={() => navigate("/general/site")}
						/>
					</SettingsSection>
				) : null}
			</SettingsForm>
		</>
	)
}
