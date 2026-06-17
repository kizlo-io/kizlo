export function isWordPressResourceError<TCode extends string>(data: unknown): data is { code: TCode; message: string } {
	if (typeof data !== "object" || data === null) return false
	const record = data as Record<string, unknown>
	return typeof record.code === "string" && typeof record.message === "string"
}
