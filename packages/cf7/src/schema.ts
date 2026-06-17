import z from "zod/v4"

export const CaptchaInput = z.object({
	captchaToken: z.string(),
})
export type CaptchaInput = z.infer<typeof CaptchaInput>

export const SubmitFormResult = z.object({
	message: z.string(),
	success: z.boolean(),
	invalidFields: z.array(
		z.object({
			field: z.string(),
			message: z.string(),
		}),
	),
})
export type SubmitFormResult = z.infer<typeof SubmitFormResult>

export const SubmitFormInput = z.object({
	formId: z.coerce.number(),
	fields: z.record(z.string(), z.unknown()),
	captchaToken: z.string(),
})
export type SubmitFormInput = z.infer<typeof SubmitFormInput>
