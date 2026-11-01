import { safeValidateSchema } from "@kizlo/shared"
import { KizloError } from "../shared/error"
import type { AnyEvents, InferEventUnion } from "."
import { type AnyEvent, KizloEvent } from "./schema"

export async function validateEvent<T extends AnyEvents>(
	events: T | undefined,
	data: AnyEvent,
	failureMode: "log" | "retry" = "log",
): Promise<KizloEvent | InferEventUnion<T> | null> {
	const explicit = events?.find((entry) => entry.types.includes(data.type))?.data
	if (failureMode === "retry" && explicit) {
		const result = await safeValidateSchema(explicit, data.data)
		if (!result.success)
			throw new KizloError("UNPROCESSABLE_CONTENT", {
				message: "Invalid webhook dependencies. Update the event-producing plugin and check affected_terms.",
			})
		return { type: data.type, data: result.value } as never
	}
	const internal = await safeValidateSchema(KizloEvent, data)
	if (internal.success) return internal.value

	const external = events?.find((a) => a.types.includes(data.type))?.data
	if (external) {
		const result = await safeValidateSchema(external, data.data)
		if (!result.success) return null
		return { type: data.type, data: result.value } as never
	}

	return null
}
