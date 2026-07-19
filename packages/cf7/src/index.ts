import type { Schema, SchemaInput } from "@kizlo/shared"
import { createExtension, createProcedure, KizloError, schemaType, WP_KIZLO_BASE } from "kizlo"
import { CaptchaInput, type SubmitFormResult } from "./schema"
import type { WP_SubmitCF7Data } from "./types"

export interface ContactFormSevenOptions {
	id: number
	fields: Schema
}

export function contactFormSeven<TId extends string, TOptions extends ContactFormSevenOptions>(id: TId, options: TOptions) {
	return createExtension({
		id,
		init: () => {
			return {
				router: {
					submit: createProcedure(
						{
							scope: "remote",
							method: "POST",
							input: schemaType<SchemaInput<TOptions["fields"]> & CaptchaInput>(),
							output: schemaType<SubmitFormResult>(),
						},
						async ({ context, input }) => {
							const captchaResult = await CaptchaInput["~standard"].validate(input)

							if ("issues" in captchaResult) {
								throw new KizloError("BAD_REQUEST", { message: "Missing or invalid captcha token", data: captchaResult.issues })
							}

							const isValid = await context.verifyCaptcha(captchaResult.value.captchaToken)
							if (!isValid) throw new KizloError("FORBIDDEN", { message: "Captcha verification failed" })

							const formResult = await options.fields["~standard"].validate(input)
							if ("issues" in formResult) {
								throw new KizloError("BAD_REQUEST", { message: "Invalid form data", data: formResult.issues })
							}

							const response = await context.wordpress.post<WP_SubmitCF7Data>(`/cf7/${options.id}`, {
								body: formResult.value as Record<string, unknown>,
								base: WP_KIZLO_BASE,
							})
							if (response.error) throw response.error

							return {
								message: response.data.message,
								invalidFields: response.data.invalid_fields,
								success: response.data.status === "mail_sent",
							}
						},
					),
				},
			}
		},
	})
}
