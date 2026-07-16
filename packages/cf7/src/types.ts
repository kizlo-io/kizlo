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
