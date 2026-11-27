import { expect, test } from "vitest"
import { deserializeSubmission } from "."

test("preserves CF7 validation messages and submission success", () => {
	expect(deserializeSubmission({ status: "mail_sent", message: "Sent", invalid_fields: [] })).toEqual({
		message: "Sent",
		success: true,
		invalidFields: [],
	})
	expect(
		deserializeSubmission({
			status: "validation_failed",
			message: "Check the form",
			invalid_fields: [{ field: "email", message: "Required" }],
		}),
	).toEqual({ message: "Check the form", success: false, invalidFields: [{ field: "email", message: "Required" }] })
})
