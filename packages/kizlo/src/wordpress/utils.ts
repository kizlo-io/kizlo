export function isWordPressResourceError<TCode extends string>(data: unknown): data is { code: TCode; message: string; data?: unknown } {
	if (typeof data !== "object" || data === null) return false
	const record = data as Record<string, unknown>
	return typeof record.code === "string" && typeof record.message === "string"
}

import type { WP_Result } from "./types"

/** Unwrap a successful direct response for server loaders and presentation helpers. */
export function requireData<T extends WP_Result<unknown, string>>(result: T): Extract<T, { error: null }>["data"]
export function requireData(result: WP_Result<unknown, string>): unknown {
	if (result.error) throw result.error
	return result.data
}
