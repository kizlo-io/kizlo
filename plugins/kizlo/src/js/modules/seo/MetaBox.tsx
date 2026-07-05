import { useMemo, useState } from "react"
import { type Control, type FieldPath, useForm } from "react-hook-form"
import { ArticleTypeField } from "@/modules/settings/shared/article-type-field"
import { PageTypeField } from "@/modules/settings/shared/page-type-field"
import { SwitchField, TextInputField } from "@/shared/components/fields"
import { MediaPicker } from "@/shared/components/ui/media-picker"
import { Tabs } from "@/shared/components/ui/tabs"
import { VariableField } from "@/shared/components/variable-field"
import type { MediaItem } from "@/shared/hooks/use-media-library"
import type { Variable } from "@/shared/lib/schema"
import type { SeoDefaults, SeoImage, SeoMeta } from "./types"

interface SeoForm {
	title: string
	description: string
	canonical: string
	webpage_type: string
	article_type: string
	og_title: string
	og_description: string
	twitter_title: string
	twitter_description: string
	noindex: boolean
	nofollow: boolean
}

interface MetaBoxProps {
	meta: SeoMeta
	defaults: SeoDefaults
	variables: Variable[]
}

export function MetaBox({ meta, defaults, variables }: MetaBoxProps) {
	const form = useForm<SeoForm>({
		defaultValues: {
			title: meta.title,
			description: meta.description,
			canonical: meta.canonical,
			// Pre-select the post-type default so the recommended value is visible;
			// an existing override wins if present.
			webpage_type: meta.webpage_type || defaults.webpage_type,
			article_type: meta.article_type || defaults.article_type,
			og_title: meta.og.title,
			og_description: meta.og.description,
			twitter_title: meta.twitter.title,
			twitter_description: meta.twitter.description,
			noindex: meta.noindex,
			nofollow: meta.nofollow,
		},
	})

	const [ogImage, setOgImage] = useState<SeoImage | null>(meta.og.image)
	const [twitterImage, setTwitterImage] = useState<SeoImage | null>(meta.twitter.image)

	const values = form.watch()

	const serialized = useMemo(
		() =>
			JSON.stringify({
				title: values.title.trim(),
				description: values.description.trim(),
				canonical: values.canonical.trim(),
				noindex: values.noindex,
				nofollow: values.nofollow,
				og_title: values.og_title.trim(),
				og_description: values.og_description.trim(),
				twitter_title: values.twitter_title.trim(),
				twitter_description: values.twitter_description.trim(),
				// Only persist a schema type when it deviates from the default, so an
				// untouched select keeps inheriting the post-type setting.
				...(values.webpage_type !== defaults.webpage_type ? { webpage_type: values.webpage_type } : {}),
				...(values.article_type !== defaults.article_type ? { article_type: values.article_type } : {}),
				...(ogImage ? { og_image_id: ogImage.id } : {}),
				...(twitterImage ? { twitter_image_id: twitterImage.id } : {}),
			}),
		[values, defaults.webpage_type, defaults.article_type, ogImage, twitterImage],
	)

	return (
		<div className="py-2">
			<input type="hidden" name="kizlo_seo" value={serialized} />

			<Tabs
				tabs={[
					{ name: "seo", title: "SEO" },
					{ name: "schema", title: "Schema" },
					{ name: "social", title: "Social" },
					{ name: "advanced", title: "Advanced" },
				]}
			>
				{(name) => (
					<div className="pt-4">
						{name === "seo" ? (
							<div className="flex flex-col gap-7">
								<VariableField
									control={form.control}
									name="title"
									variant="text"
									label="SEO title"
									placeholder={defaults.title}
									description="Leave empty to use the post-type title template."
									variables={variables}
								/>
								<VariableField
									control={form.control}
									name="description"
									variant="textarea"
									label="Meta description"
									placeholder={defaults.description}
									description="Shown in search results and social previews when set."
									variables={variables}
								/>
							</div>
						) : null}

						{name === "schema" ? (
							<div className="flex flex-col gap-7">
								<PageTypeField
									control={form.control}
									name="webpage_type"
									description="The Schema.org WebPage subtype. Preset to the post-type default; change it to override for this post."
								/>
								<ArticleTypeField
									control={form.control}
									name="article_type"
									description="The Schema.org Article subtype. Preset to the post-type default; change it to override for this post."
								/>
							</div>
						) : null}

						{name === "social" ? (
							<div className="flex flex-col gap-8">
								<SocialGroup
									heading="Open Graph"
									hint="Facebook, LinkedIn, and most link previews."
									control={form.control}
									titleName="og_title"
									descName="og_description"
									variables={variables}
									titlePlaceholder={defaults.title}
									descPlaceholder={defaults.description}
									initialImageUrl={meta.og.image?.url}
									onImageChange={(item) => setOgImage(item ? { id: item.id, url: item.url } : null)}
								/>

								<SocialGroup
									heading="Twitter"
									hint="X / Twitter cards. Falls back to the Open Graph values."
									control={form.control}
									titleName="twitter_title"
									descName="twitter_description"
									variables={variables}
									titlePlaceholder={defaults.title}
									descPlaceholder={defaults.description}
									initialImageUrl={meta.twitter.image?.url}
									onImageChange={(item) => setTwitterImage(item ? { id: item.id, url: item.url } : null)}
								/>
							</div>
						) : null}

						{name === "advanced" ? (
							<div className="flex flex-col gap-7">
								<TextInputField
									control={form.control}
									name="canonical"
									label="Canonical URL"
									placeholder={defaults.canonical}
									description="Override the canonical link for this post."
								/>
								<SwitchField
									control={form.control}
									name="noindex"
									label="No index"
									description="Ask search engines not to index this post."
								/>
								<SwitchField
									control={form.control}
									name="nofollow"
									label="No follow"
									description="Ask search engines not to follow links on this post."
								/>
							</div>
						) : null}
					</div>
				)}
			</Tabs>
		</div>
	)
}

interface SocialGroupProps {
	heading: string
	hint: string
	control: Control<SeoForm>
	titleName: FieldPath<SeoForm>
	descName: FieldPath<SeoForm>
	variables: Variable[]
	titlePlaceholder: string
	descPlaceholder: string
	initialImageUrl?: string | null
	onImageChange: (item: MediaItem | null) => void
}

function SocialGroup({
	heading,
	hint,
	control,
	titleName,
	descName,
	variables,
	titlePlaceholder,
	descPlaceholder,
	initialImageUrl,
	onImageChange,
}: SocialGroupProps) {
	return (
		<div className="flex flex-col gap-4">
			<div>
				<p className="font-medium text-sm">{heading}</p>
				<p className="text-muted-foreground text-sm">{hint}</p>
			</div>

			<div className="flex flex-col gap-7">
				<VariableField
					control={control}
					name={titleName}
					variant="text"
					label="Title"
					placeholder={titlePlaceholder}
					variables={variables}
				/>
				<VariableField
					control={control}
					name={descName}
					variant="textarea"
					label="Description"
					placeholder={descPlaceholder}
					variables={variables}
				/>
				<MediaPicker
					type="image"
					width={1200}
					height={630}
					label="Image"
					url={initialImageUrl ?? undefined}
					onValueChange={onImageChange}
					desc="Recommended 1200×630. Falls back to the featured image."
				/>
			</div>
		</div>
	)
}
