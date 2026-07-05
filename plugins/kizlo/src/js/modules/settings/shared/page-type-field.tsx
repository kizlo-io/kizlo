import type { FieldValues } from "react-hook-form"
import { type BaseFieldProps, ComboboxField, type SelectOption } from "@/shared/components/fields"

export const webpageTypeOptions: SelectOption[] = [
	{ value: "WebPage", label: "Web Page (default)" },
	{ value: "ItemPage", label: "Item Page" },
	{ value: "AboutPage", label: "About Page" },
	{ value: "FAQPage", label: "FAQ Page" },
	{ value: "QAPage", label: "QA Page" },
	{ value: "ProfilePage", label: "Profile Page" },
	{ value: "ContactPage", label: "Contact Page" },
	{ value: "MedicalWebPage", label: "Medical Web Page" },
	{ value: "CollectionPage", label: "Collection Page" },
	{ value: "CheckoutPage", label: "Checkout Page" },
	{ value: "RealEstateListing", label: "Real Estate Listing" },
	{ value: "SearchResultsPage", label: "Search Results Page" },
]

interface PageTypeFieldProps<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>
	extends Omit<BaseFieldProps<TFieldValues, TContext, TTransformedValues>, "label" | "placeholder"> {}

export function PageTypeField<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>({
	control,
	name,
	description,
}: PageTypeFieldProps<TFieldValues, TContext, TTransformedValues>) {
	return <ComboboxField control={control} name={name} label="Web Page Type" options={webpageTypeOptions} description={description} />
}
