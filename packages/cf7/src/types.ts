import type { Result } from "@kizlo/shared"

export interface CF7ServiceInterface {
	submit(input: WP_SubmitCF7Input): Promise<WP_SubmitCF7Result>
}

export interface WP_SubmitCF7Input {
	form_id: number
	fields: Record<string, unknown>
}
export type WP_CF7Status = "mail_sent" | "mail_failed" | "validation_failed" | "spam" | "aborted"

export interface WP_SubmitCF7Data {
	status: WP_CF7Status
	message: string
	form_id: number
	invalid_fields: {
		field: string
		message: string
	}[]
}
export type WP_SubmitCF7Result = Result<WP_SubmitCF7Data>
