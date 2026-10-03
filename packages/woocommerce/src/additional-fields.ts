import type { WP_Schema } from "kizlo"
import z from "zod/v4"

type ScalarFields = Record<string, string | boolean | undefined>
type RegisteredRead<TLocation extends string> =
	WP_Schema<`woocommerce.additional-fields.${TLocation}.read`, ScalarFields> extends Record<string, never>
		? ScalarFields
		: WP_Schema<`woocommerce.additional-fields.${TLocation}.read`, ScalarFields> & ScalarFields
type RegisteredWrite<TLocation extends string> = WP_Schema<`woocommerce.additional-fields.${TLocation}.write`, ScalarFields>

export type AddressAdditionalFields = RegisteredRead<"address">
export type AddressAdditionalFieldsInput = Partial<RegisteredWrite<"address">>
export type AddressAdditionalFieldsSubmission = RegisteredWrite<"address">
export type ContactAdditionalFields = RegisteredRead<"contact">
export type CheckoutAdditionalFields = RegisteredRead<"checkout">
export type CheckoutAdditionalFieldsInput = Partial<RegisteredWrite<"checkout">>
export type CheckoutAdditionalFieldsSubmission = RegisteredWrite<"checkout">

/** Structural scalar guard only. Generated types do not execute field enums, requirements or conditions. */
function fieldsSchema<TOutput extends object, TInput extends object>(): z.ZodType<TOutput, TInput> {
	return z.custom<TOutput>(
		(value) =>
			typeof value === "object" &&
			value !== null &&
			!Array.isArray(value) &&
			Object.values(value).every((field) => field === undefined || typeof field === "string" || typeof field === "boolean"),
	) as unknown as z.ZodType<TOutput, TInput>
}

export const AddressAdditionalFieldsSchema: z.ZodType<AddressAdditionalFields, AddressAdditionalFieldsInput> = fieldsSchema()
export const AddressAdditionalFieldsSubmissionSchema: z.ZodType<AddressAdditionalFields, AddressAdditionalFieldsSubmission> = fieldsSchema()
export const ContactAdditionalFieldsSchema: z.ZodType<ContactAdditionalFields, Partial<RegisteredWrite<"contact">>> = fieldsSchema()
export const CheckoutAdditionalFieldsSchema: z.ZodType<CheckoutAdditionalFields, CheckoutAdditionalFieldsInput> = fieldsSchema()
export const CheckoutAdditionalFieldsSubmissionSchema: z.ZodType<CheckoutAdditionalFields, CheckoutAdditionalFieldsSubmission> =
	fieldsSchema()

/** Retain compatible unknown response keys. WooCommerce validates writes against its live registry. */
export function additionalFieldValues<T extends object>(value: unknown): T {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return {} as T
	return Object.fromEntries(Object.entries(value).filter(([, field]) => typeof field === "string" || typeof field === "boolean")) as T
}
