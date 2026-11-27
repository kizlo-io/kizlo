import type { WP_EndpointData } from "kizlo"
import type { SubmitFormResult } from "./schema"

export * from "./schema"

/** Present the result after WordPress and CF7 validate and process the submitted form. */
export function deserializeSubmission(data: WP_EndpointData<"cf7.forms.submit">): SubmitFormResult {
	return { message: data.message, invalidFields: data.invalid_fields, success: data.status === "mail_sent" }
}
