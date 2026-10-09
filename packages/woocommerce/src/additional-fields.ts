import type { WP_Schema } from "kizlo"
import z from "zod/v4"
import { isExcludedRegisteredField, isProjectedBillingField, type ProjectedBillingFieldId } from "./field-projections"

type ScalarFields = Record<string, string | boolean | undefined>
/** Key remapping retains named properties and modifiers on schemas with a string index. */
type WithoutFields<T, TExcluded extends string> = { [K in keyof T as K extends TExcluded ? never : K]: T[K] }
type RegisteredRead<TLocation extends string, TExcluded extends string = never> =
	WP_Schema<`woocommerce.additional-fields.${TLocation}.read`, ScalarFields> extends Record<string, never>
		? ScalarFields
		: [TExcluded] extends [never]
			? WP_Schema<`woocommerce.additional-fields.${TLocation}.read`, ScalarFields> & ScalarFields
			: WithoutFields<WP_Schema<`woocommerce.additional-fields.${TLocation}.read`, ScalarFields>, TExcluded> & ScalarFields
type RegisteredWrite<TLocation extends string> = WP_Schema<`woocommerce.additional-fields.${TLocation}.write`, ScalarFields>

export type AddressAdditionalFields = RegisteredRead<"address">
export type AddressAdditionalFieldsInput = Partial<RegisteredWrite<"address">>
export type AddressAdditionalFieldsSubmission = RegisteredWrite<"address">
/** Explicit never keys also prevent the compatible unknown-read index from reintroducing a projected value. */
type WithoutBillingProjections<T> = WithoutFields<T, ProjectedBillingFieldId> & { [K in ProjectedBillingFieldId]?: never }
export type BillingAdditionalFields = RegisteredRead<"address", ProjectedBillingFieldId> & { [K in ProjectedBillingFieldId]?: never }
export type BillingAdditionalFieldsInput = WithoutBillingProjections<AddressAdditionalFieldsInput>
export type BillingAdditionalFieldsSubmission = WithoutBillingProjections<AddressAdditionalFieldsSubmission>

export type ContactAdditionalFields = RegisteredRead<"contact">
export type CheckoutAdditionalFields = RegisteredRead<"checkout">
export type CheckoutAdditionalFieldsInput = Partial<RegisteredWrite<"checkout">>
export type CheckoutAdditionalFieldsSubmission = RegisteredWrite<"checkout">

/** Structural scalar guard only. Generated types do not execute field enums, requirements or conditions. */
function fieldsSchema<TOutput extends object, TInput extends object>(
	acceptKey: (id: string) => boolean = () => true,
): z.ZodType<TOutput, TInput> {
	return z.custom<TOutput>(
		(value) =>
			typeof value === "object" &&
			value !== null &&
			!Array.isArray(value) &&
			Object.entries(value).every(
				([id, field]) => acceptKey(id) && (field === undefined || typeof field === "string" || typeof field === "boolean"),
			),
	) as unknown as z.ZodType<TOutput, TInput>
}

export const AddressAdditionalFieldsSchema: z.ZodType<AddressAdditionalFields, AddressAdditionalFieldsInput> = fieldsSchema()
export const AddressAdditionalFieldsSubmissionSchema: z.ZodType<AddressAdditionalFields, AddressAdditionalFieldsSubmission> = fieldsSchema()
export const BillingAdditionalFieldsSchema: z.ZodType<BillingAdditionalFields, BillingAdditionalFieldsInput> = fieldsSchema(
	(id) => !isProjectedBillingField(id),
)
export const BillingAdditionalFieldsSubmissionSchema: z.ZodType<BillingAdditionalFields, BillingAdditionalFieldsSubmission> = fieldsSchema(
	(id) => !isProjectedBillingField(id),
)
export const ContactAdditionalFieldsSchema: z.ZodType<ContactAdditionalFields, Partial<RegisteredWrite<"contact">>> = fieldsSchema()
export const CheckoutAdditionalFieldsSchema: z.ZodType<CheckoutAdditionalFields, CheckoutAdditionalFieldsInput> = fieldsSchema()
export const CheckoutAdditionalFieldsSubmissionSchema: z.ZodType<CheckoutAdditionalFields, CheckoutAdditionalFieldsSubmission> =
	fieldsSchema()

/** Retain compatible unknown response keys. WooCommerce validates writes against its live registry. */
export function additionalFieldValues<T extends object>(value: unknown): T {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return {} as T
	return Object.fromEntries(Object.entries(value).filter(([, field]) => typeof field === "string" || typeof field === "boolean")) as T
}

/** Keep unprojected and compatible unknown values while exposing each billing value only once. */
export function billingAdditionalFieldValues(value: unknown): BillingAdditionalFields {
	return Object.fromEntries(
		Object.entries(additionalFieldValues(value)).filter(([id]) => !isProjectedBillingField(id)),
	) as BillingAdditionalFields
}

export function shippingAdditionalFieldValues(value: unknown): AddressAdditionalFields {
	return Object.fromEntries(
		Object.entries(additionalFieldValues(value)).filter(([id]) => !isExcludedRegisteredField(id, "shipping")),
	) as AddressAdditionalFields
}
