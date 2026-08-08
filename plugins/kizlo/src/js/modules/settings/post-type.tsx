import { zodResolver } from "@hookform/resolvers/zod"
import { type ReactNode, useMemo } from "react"
import { type Control, type UseFormReturn, useForm } from "react-hook-form"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import { CustomFieldsBuilder } from "@/modules/settings/custom-fields/builder"
import { DeleteRegistration } from "@/modules/settings/registration/delete-dialog"
import { postTypeRegistrationValues } from "@/modules/settings/registration/lib"
import {
	PostTypeActiveField,
	PostTypeApiFields,
	PostTypeCapabilityFields,
	PostTypeDeleteWithUserField,
	PostTypeEditorSupportsFields,
	PostTypeExcludeFromSearchField,
	PostTypeExportField,
	PostTypeHierarchicalField,
	PostTypeIdentityFields,
	PostTypeLabelFields,
	PostTypeLabelSync,
	PostTypeMenuDetailsFields,
	PostTypePublicField,
	PostTypeShowInAdminBarField,
	PostTypeShowInMenuField,
	PostTypeShowInNavMenusField,
	PostTypeShowUiField,
} from "@/modules/settings/registration/post-type-cards"
import { ArticleTypeField } from "@/modules/settings/shared/article-type-field"
import { getContent } from "@/modules/settings/shared/content"
import { NotFound } from "@/modules/settings/shared/not-found"
import { PageTypeField } from "@/modules/settings/shared/page-type-field"
import { BreadcrumbsField } from "@/shared/components/breadcrumbs-field"
import { SwitchField } from "@/shared/components/fields"
import { SectionDesc } from "@/shared/components/section-desc"
import { SettingsCard, SettingsCollapsibleCard, SettingsForm, SettingsGroup } from "@/shared/components/settings"
import { VariableField } from "@/shared/components/variable-field"
import { useNavPage } from "@/shared/lib/nav"
import {
	createPostTypeUnifiedSchema,
	type PostTypeRegistrationInput,
	type PostTypeRegistrationOutput,
	type PostTypeUnifiedInput,
	type PostTypeUnifiedOutput,
} from "@/shared/lib/schema"
import { useSettings, useSettingsForm } from "@/shared/lib/settings"

export function PostTypeSettingsPage() {
	const params = useParams<{ slug: string }>()
	const navigate = useNavigate()
	const { pathname } = useLocation()
	const { settings } = useSettings()
	const postType = settings?.post_types.find((a) => a.slug === params.slug)
	const navPage = useNavPage(pathname)
	const taxonomyOptions = useMemo(() => (settings?.taxonomies ?? []).map((t) => ({ value: t.slug, label: t.name })), [settings])

	const reservedFieldNames = settings?.constants.post_type.reserved_field_names
	const schema = useMemo(() => createPostTypeUnifiedSchema(reservedFieldNames ?? []), [reservedFieldNames])

	const values = useMemo<PostTypeUnifiedInput>(() => {
		const settingsValues = {
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
		}

		return postType?.kizlo_owned && postType.registration
			? { ...settingsValues, ...postTypeRegistrationValues(postType.registration) }
			: settingsValues
	}, [postType])

	const form = useForm<PostTypeUnifiedInput, unknown, PostTypeUnifiedOutput>({ resolver: zodResolver(schema), values })
	const formProps = useSettingsForm("post_types", postType?.slug ?? "", form)

	if (!postType) return <NotFound />

	const isKizlo = Boolean(postType.kizlo_owned && postType.registration)
	const isSeoSupported = form.watch("seo_enabled")
	const isArticleType = form.watch("article_type") !== "none"
	const showInMenu = form.watch("show_in_menu")
	const content = getContent({ name: postType.name ?? "Posts" })
	const sections = navPage?.sections ?? []

	const regControl = form.control as unknown as Control<PostTypeRegistrationInput, unknown, PostTypeRegistrationOutput>
	const regForm = form as unknown as UseFormReturn<PostTypeRegistrationInput, unknown, PostTypeRegistrationOutput>

	const bodies: Partial<Record<string, ReactNode>> = {
		general: (
			<>
				<SettingsCard>
					{isKizlo ? <PostTypeIdentityFields control={regControl} /> : null}
					<VariableField
						name="pathname_structure"
						label={content.url.pathname.label}
						control={form.control}
						variables={settings?.constants.post_type.path_variables ?? []}
						description={content.url.pathname.description}
					/>

					{isKizlo ? <PostTypeEditorSupportsFields control={regControl} taxonomyOptions={taxonomyOptions} /> : null}
				</SettingsCard>

				{isKizlo ? (
					<>
						<SettingsCollapsibleCard
							title="Admin labels"
							description="Override the wording WordPress shows for this post type, like the menu name and the “Add new” button."
						>
							<PostTypeLabelFields control={regControl} />
						</SettingsCollapsibleCard>

						<SettingsCard>
							<PostTypeActiveField control={regControl} />
						</SettingsCard>
					</>
				) : null}
			</>
		),
		fields: (
			<>
				<SettingsCard>
					<CustomFieldsBuilder control={form.control} name="custom_fields" />
				</SettingsCard>
			</>
		),
		seo: (
			<>
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
			</>
		),
		api: (
			<SettingsCard>
				<SwitchField
					control={form.control}
					name="rest_api_enabled"
					label={content.access.enabled.label}
					description={content.access.enabled.description}
				/>
			</SettingsCard>
		),
		advanced: (
			<>
				<SettingsCard>
					<PostTypePublicField control={regControl} />
				</SettingsCard>
				<SettingsCard>
					<PostTypeHierarchicalField control={regControl} />
				</SettingsCard>
				<SettingsCard>
					<PostTypeShowUiField control={regControl} />
				</SettingsCard>
				<SettingsCard>
					<PostTypeShowInMenuField control={regControl} />
				</SettingsCard>
				{showInMenu ? (
					<SettingsCard>
						<PostTypeMenuDetailsFields control={regControl} />
					</SettingsCard>
				) : null}
				<SettingsCard>
					<PostTypeShowInAdminBarField control={regControl} />
				</SettingsCard>
				<SettingsCard>
					<PostTypeShowInNavMenusField control={regControl} />
				</SettingsCard>
				<SettingsCard>
					<PostTypeExportField control={regControl} />
				</SettingsCard>
				<SettingsCard>
					<PostTypeDeleteWithUserField control={regControl} />
				</SettingsCard>
				<SettingsCard>
					<PostTypeExcludeFromSearchField control={regControl} />
				</SettingsCard>
				<SettingsCard>
					<SwitchField
						control={form.control}
						name="rest_api_enabled"
						label={content.access.enabled.label}
						description={content.access.enabled.description}
					/>
				</SettingsCard>
				<SettingsCard>
					<PostTypeApiFields control={regControl} />
				</SettingsCard>
				<SettingsCard>
					<PostTypeCapabilityFields control={regControl} />
				</SettingsCard>
				{navPage?.delete ? (
					<SettingsCard>
						<DeleteRegistration
							kind="post_types"
							slug={postType.slug}
							name={postType.registration?.plural_label || postType.slug}
							label={navPage.delete.label}
							desc={navPage.delete.desc}
							onDeleted={() => navigate("/general/site")}
						/>
					</SettingsCard>
				) : null}
			</>
		),
	}

	return (
		<SettingsForm key={params.slug} {...formProps}>
			{sections.map((section) => (
				<SettingsGroup key={section.id} id={section.id} title={section.title} desc={<SectionDesc html={section.desc} />}>
					{bodies[section.id]}
				</SettingsGroup>
			))}

			{isKizlo ? <PostTypeLabelSync form={regForm} /> : null}
		</SettingsForm>
	)
}
