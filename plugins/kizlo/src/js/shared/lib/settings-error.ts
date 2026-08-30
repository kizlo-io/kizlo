export function settingsErrorMessage(error: unknown): string {
	if (!error || typeof error !== "object") return "Settings could not be saved."
	const response = error as {
		message?: unknown
		data?: {
			details?: Record<string, { message?: unknown }>
			params?: Record<string, unknown>
		}
	}
	const detail = Object.values(response.data?.details ?? {}).find((value) => typeof value?.message === "string")?.message
	if (typeof detail === "string" && detail !== "") return detail
	const parameter = Object.values(response.data?.params ?? {}).find((value) => typeof value === "string")
	if (typeof parameter === "string" && parameter !== "") return parameter
	return typeof response.message === "string" && response.message !== "" ? response.message : "Settings could not be saved."
}
