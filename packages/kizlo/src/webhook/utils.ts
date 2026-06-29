import { safeValidateSchema } from "@kizlo/shared"
import type { AnyEvents, InferEventUnion } from "."
import { type AnyEvent, KizloEvent } from "./schema"

export async function validateEvent<T extends AnyEvents>(
	events: T | undefined,
	data: AnyEvent,
): Promise<KizloEvent | InferEventUnion<T> | null> {
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
