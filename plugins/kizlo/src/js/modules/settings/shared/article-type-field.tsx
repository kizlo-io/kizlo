import type { FieldValues } from "react-hook-form"
import { type BaseFieldProps, ComboboxField, type SelectOption } from "@/shared/components/fields"

export const articleTypeOptions: SelectOption[] = [
	{ value: "Article", label: "Article (default)" },
	{ value: "BlogPosting", label: "Blog Post" },
	{ value: "SocialMediaPosting", label: "Social Media Posting" },
	{ value: "NewsArticle", label: "News Article" },
	{ value: "AdvertiserContentArticle", label: "Advertiser Content Article" },
	{ value: "SatiricalArticle", label: "Satirical Article" },
	{ value: "ScholarlyArticle", label: "Scholarly Article" },
	{ value: "TechArticle", label: "Tech Article" },
	{ value: "Report", label: "Report" },
	{ value: "none", label: "None" },
]

interface ArticleTypeFieldProps<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>
	extends Omit<BaseFieldProps<TFieldValues, TContext, TTransformedValues>, "label" | "placeholder"> {}

export function ArticleTypeField<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>({
	control,
	name,
	description,
}: ArticleTypeFieldProps<TFieldValues, TContext, TTransformedValues>) {
	return <ComboboxField control={control} name={name} label="Article Type" options={articleTypeOptions} description={description} />
}
