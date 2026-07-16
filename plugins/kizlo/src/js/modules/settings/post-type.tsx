import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useParams } from "react-router-dom"
import { ArticleTypeField } from "@/modules/settings/shared/article-type-field"
import { getContent } from "@/modules/settings/shared/content"
import { NotFound } from "@/modules/settings/shared/not-found"
import { PageTypeField } from "@/modules/settings/shared/page-type-field"
import { RestApiSection } from "@/modules/settings/shared/rest-api-section"
import { BreadcrumbsField } from "@/shared/components/breadcrumbs-field"
import { SwitchField } from "@/shared/components/fields"
import { SettingsForm, SettingsSection } from "@/shared/components/settings"
import { VariableField } from "@/shared/components/variable-field"
import { type PostTypeSettingsInput, type PostTypeSettingsOutput, PostTypeSettingsSchema } from "@/shared/lib/schema"
import { useSettings, useSettingsForm } from "@/shared/lib/settings"

export function PostTypeSettingsPage() {
	const params = useParams<{ slug: string }>()
	const { settings } = useSettings()
	const postType = settings?.post_types.find((a) => a.slug === params.slug)

	const form = useForm<PostTypeSettingsInput, unknown, PostTypeSettingsOutput>({
		resolver: zodResolver(PostTypeSettingsSchema),
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
		},
	})

	const formProps = useSettingsForm("post_types", postType?.slug ?? "", form)

	if (!postType) return <NotFound />

	const isSeoSupported = form.watch("seo_enabled")
	const isArticleType = form.watch("article_type") !== "none"
	const content = getContent({ name: postType.name ?? "Posts" })

	return (
		<SettingsForm key={params.slug} {...formProps}>
			<SettingsSection title={content.url.heading} desc={content.url.description}>
				<VariableField
					name="pathname_structure"
					label={content.url.pathname.label}
					control={form.control}
					variables={settings?.constants.post_type.path_variables ?? []}
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
							placeholder={settings?.constants.post_type.default_title_format}
							description={content.seo.title.description}
							variables={postType.content_variables}
							variant="text"
						/>

						<VariableField
							variant="textarea"
							control={form.control}
							name="description_structure"
							label={content.seo.description_.label}
							placeholder={settings?.constants.post_type.default_desc_format}
							description={content.seo.description_.description}
							variables={postType.content_variables}
						/>

						<PageTypeField control={form.control} name="webpage_type" description={content.seo.pageType.description} />

						<ArticleTypeField control={form.control} name="article_type" description={content.seo.articleType.description} />

						{postType.supports.comments && isArticleType ? (
							<VariableField
								name="comment_action_structure"
								control={form.control}
								label={content.seo.commentUrl.label}
								variables={[
									...(settings?.constants.post_type.path_variables ?? []),
									{ label: "pathname", description: "Resolved pathname of the post.", value: "{{pathname}}" },
								]}
								description={content.seo.commentUrl.description}
							/>
						) : null}

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
									The crumbs between <strong>Home</strong> and the current item. Add pages, or the dynamic <strong>Parent</strong> slot
									(expands to the item's real parents). Order matters — reorder with the arrows. Leave empty for{" "}
									<strong>Home → current</strong>.
								</>
							}
						/>
					</>
				) : null}
			</SettingsSection>

			<RestApiSection control={form.control} access={content.access} internal={postType.internal} />
		</SettingsForm>
	)
}
