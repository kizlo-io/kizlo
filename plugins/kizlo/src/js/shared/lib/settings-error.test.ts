import { describe, expect, it } from "vitest"
import { settingsErrorMessage } from "./settings-error"

describe("settings error messages", () => {
	it("surfaces the most specific REST validation detail", () => {
		expect(
			settingsErrorMessage({
				message: "Invalid parameter(s): custom_fields",
				data: {
					details: { custom_fields: { message: "Custom field storage paths collide." } },
					params: { custom_fields: "The field configuration is invalid." },
				},
			}),
		).toBe("Custom field storage paths collide.")
	})

	it("falls back through parameter, response, and generic messages", () => {
		expect(settingsErrorMessage({ data: { params: { custom_fields: "Fix the custom fields." } } })).toBe("Fix the custom fields.")
		expect(settingsErrorMessage({ message: "Request failed." })).toBe("Request failed.")
		expect(settingsErrorMessage(null)).toBe("Settings could not be saved.")
	})
})
