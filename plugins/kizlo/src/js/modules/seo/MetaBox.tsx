import {
	ArticleIcon,
	BrowsersIcon,
	EyeIcon,
	GlobeIcon,
	LinkIcon,
	PaperPlaneTiltIcon,
	TextAlignLeftIcon,
	TextTIcon,
	XLogoIcon,
} from "@phosphor-icons/react"
import { useMemo, useState } from "react"
import { type Control, type FieldPath, useForm } from "react-hook-form"
import { ArticleTypeField, articleTypeOptions } from "@/modules/settings/shared/article-type-field"
import { PageTypeField, webpageTypeOptions } from "@/modules/settings/shared/page-type-field"
import { SwitchField, TextInputField } from "@/shared/components/fields"
import { MediaPicker } from "@/shared/components/ui/media-picker"
import { VariableField } from "@/shared/components/variable-field"
import type { MediaItem } from "@/shared/hooks/use-media-library"
import type { Variable } from "@/shared/lib/schema"
import { cn } from "@/shared/lib/utils"
import { Accordion, AccordionRow, type Tone } from "./accordion"
import { Preview } from "./Preview"
import { resolveTemplate } from "./resolve"
import type { SeoDefaults, SeoImage, SeoMeta, SeoTemplates, SeoVariant } from "./types"
import { useEditorContext } from "./use-editor-context"

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
	templates?: SeoTemplates
	context?: Record<string, string>
	variant?: SeoVariant
}

const TITLE_MAX = 60
const DESC_MAX = 160

export function MetaBox({ meta, defaults, variables, templates, context: baseline = {}, variant = "post" }: MetaBoxProps) {
	const isTerm = variant === "term"
	const noun = isTerm ? "term" : "post"
	const templateSource = isTerm ? "taxonomy" : "post-type"
	const imageDesc = isTerm ? "Recommended 1200×630." : "Recommended 1200×630. Falls back to the featured image."
	const form = useForm<SeoForm>({
		defaultValues: {
			title: meta.title,
			description: meta.description,
			canonical: meta.canonical,
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
				...(values.webpage_type !== defaults.webpage_type ? { webpage_type: values.webpage_type } : {}),
				...(values.article_type !== defaults.article_type ? { article_type: values.article_type } : {}),
				...(ogImage ? { og_image_id: ogImage.id } : {}),
				...(twitterImage ? { twitter_image_id: twitterImage.id } : {}),
			}),
		[values, defaults.webpage_type, defaults.article_type, ogImage, twitterImage],
	)

	const context = useEditorContext(baseline, variant)
	const resolved = (template: string) => resolveTemplate(template, context).trim()

	const defaultTitle = resolved(templates?.title ?? defaults.title) || defaults.title
	const defaultDescription = resolved(templates?.description ?? defaults.description) || defaults.description
	const defaultCanonical = templates ? resolveTemplate(templates.canonical, context) : defaults.canonical

	const effectiveTitle = resolved(values.title) || defaultTitle
	const effectiveDescription = resolved(values.description) || defaultDescription
	const effectiveUrl = values.canonical.trim() || defaultCanonical
	const indexable = defaults.indexable && !values.noindex
	const hasImage = Boolean(ogImage?.url || defaults.og_image?.url)

	return (
		<div className={cn("flex flex-col", isTerm && "border border-neutral-300 bg-white shadow-[0_1px_1px_rgba(0,0,0,.04)]")}>
			<input type="hidden" name="kizlo_seo" value={serialized} />

			<Preview title={effectiveTitle} description={effectiveDescription} url={effectiveUrl} indexable={indexable} />

			<Accordion>
				<AccordionRow
					id="title"
					icon={TextTIcon}
					label="SEO title"
					value={`${effectiveTitle.length} / ${TITLE_MAX}`}
					tone={lengthTone(effectiveTitle.length, 30, TITLE_MAX)}
				>
					<VariableField
						control={form.control}
						name="title"
						variant="text"
						label="Title"
						placeholder={defaultTitle}
						description={`Leave empty to use the ${templateSource} title template.`}
						variables={variables}
					/>
				</AccordionRow>

				<AccordionRow
					id="description"
					icon={TextAlignLeftIcon}
					label="Meta description"
					value={`${effectiveDescription.length} / ${DESC_MAX}`}
					tone={lengthTone(effectiveDescription.length, 120, DESC_MAX)}
				>
					<VariableField
						control={form.control}
						label="Description"
						name="description"
						variant="textarea"
						placeholder={defaultDescription}
						description="Shown in search results and social previews when set."
						variables={variables}
					/>
				</AccordionRow>

				<AccordionRow
					id="indexing"
					icon={EyeIcon}
					label="Search indexing"
					value={indexable ? "Visible in search" : "Hidden from search"}
					tone={indexable ? "good" : "bad"}
				>
					<SwitchField
						control={form.control}
						name="noindex"
						label="No index"
						description={`Ask search engines not to index this ${noun}.`}
					/>
				</AccordionRow>

				<AccordionRow
					id="following"
					icon={LinkIcon}
					label="Link following"
					value={values.nofollow ? "Links not followed" : "Links followed"}
					tone={values.nofollow ? "warn" : "good"}
				>
					<SwitchField
						control={form.control}
						name="nofollow"
						label="No follow"
						description={`Ask search engines not to follow links on this ${noun}.`}
					/>
				</AccordionRow>

				{!isTerm && (
					<AccordionRow id="page-type" icon={BrowsersIcon} label="Page type" value={labelOf(webpageTypeOptions, values.webpage_type)}>
						<PageTypeField
							control={form.control}
							label="Type"
							name="webpage_type"
							description="The Schema.org WebPage subtype. Preset to the post-type default; change it to override for this post."
						/>
					</AccordionRow>
				)}

				{!isTerm && (
					<AccordionRow id="article-type" icon={ArticleIcon} label="Article type" value={labelOf(articleTypeOptions, values.article_type)}>
						<ArticleTypeField
							label="Type"
							control={form.control}
							name="article_type"
							description="The Schema.org Article subtype. Preset to the post-type default; change it to override for this post."
						/>
					</AccordionRow>
				)}

				<AccordionRow
					id="social"
					icon={PaperPlaneTiltIcon}
					label="Social Appearance"
					value={hasImage ? "Set" : "Not set"}
					tone={hasImage ? "good" : "warn"}
				>
					<SocialGroup
						control={form.control}
						titleName="og_title"
						descName="og_description"
						variables={variables}
						titlePlaceholder={defaultTitle}
						descPlaceholder={defaultDescription}
						imageDesc={imageDesc}
						initialImageUrl={meta.og.image?.url}
						onImageChange={(item) => setOgImage(item ? { id: item.id, url: item.url } : null)}
					/>
				</AccordionRow>

				<AccordionRow
					id="twitter"
					icon={XLogoIcon}
					label="Twitter Appearance"
					value={hasImage ? "Set" : "Not set"}
					tone={hasImage ? "good" : "warn"}
				>
					<SocialGroup
						control={form.control}
						titleName="twitter_title"
						descName="twitter_description"
						variables={variables}
						titlePlaceholder={defaultTitle}
						descPlaceholder={defaultDescription}
						imageDesc={imageDesc}
						initialImageUrl={meta.twitter.image?.url}
						onImageChange={(item) => setTwitterImage(item ? { id: item.id, url: item.url } : null)}
					/>
				</AccordionRow>

				<AccordionRow id="canonical" icon={GlobeIcon} label="Canonical URL" value={values.canonical.trim() ? "Custom" : "Default"}>
					<TextInputField
						control={form.control}
						name="canonical"
						label="Canonical URL"
						placeholder={defaultCanonical}
						description="Override the canonical link for this post."
					/>
				</AccordionRow>
			</Accordion>
		</div>
	)
}

interface SocialGroupProps {
	control: Control<SeoForm>
	titleName: FieldPath<SeoForm>
	descName: FieldPath<SeoForm>
	variables: Variable[]
	titlePlaceholder: string
	descPlaceholder: string
	imageDesc: string
	initialImageUrl?: string | null
	onImageChange: (item: MediaItem | null) => void
}

function SocialGroup({
	control,
	titleName,
	descName,
	variables,
	titlePlaceholder,
	descPlaceholder,
	imageDesc,
	initialImageUrl,
	onImageChange,
}: SocialGroupProps) {
	return (
		<div className="flex flex-col gap-7">
			<VariableField control={control} name={titleName} variant="text" label="Title" placeholder={titlePlaceholder} variables={variables} />
			<VariableField
				control={control}
				name={descName}
				variant="textarea"
				label="Description"
				placeholder={descPlaceholder}
				variables={variables}
			/>
			<MediaPicker type="image" label="Image" url={initialImageUrl ?? undefined} onValueChange={onImageChange} desc={imageDesc} />
		</div>
	)
}

function lengthTone(length: number, min: number, max: number): Tone {
	if (length === 0 || length > max) return "bad"
	if (length < min) return "warn"
	return "good"
}

function labelOf(options: { value: string; label: string }[], value: string): string {
	return options.find((option) => option.value === value)?.label.replace(" (default)", "") ?? value
}
