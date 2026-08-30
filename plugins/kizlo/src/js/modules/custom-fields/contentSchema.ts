import type { CustomFieldDefinition } from "@kizlo/shared"
import { z } from "zod"

/**
 * Build a zod schema from a definition list that mirrors the nested content-form
 * values, enforcing required and type-specific rules in the browser. The server
 * re-validates the same rules on save and remains the authoritative gate; this only
 * surfaces the errors inline as the editor types.
 */
export function buildContentSchema(definitions: CustomFieldDefinition[]): z.ZodType<Record<string, unknown>> {
	return z.object(Object.fromEntries(definitions.map((definition) => [definition.name, fieldSchema(definition)])))
}

function fieldSchema(definition: CustomFieldDefinition): z.ZodTypeAny {
	switch (definition.type) {
		case "email":
			return stringSchema(definition.required, "email")
		case "url":
			return stringSchema(definition.required, "url")
		case "date":
			return stringSchema(definition.required, "date")
		case "text":
		case "textarea":
		case "richtext":
		case "select":
			return stringSchema(definition.required)
		case "number":
			return z.union([z.number(), z.null(), z.undefined()]).superRefine((value, ctx) => {
				if (definition.required && (value === null || value === undefined)) {
					ctx.addIssue({ code: "custom", message: "This field is required." })
				}
				if (typeof value === "number") refineNumber(value, definition, ctx)
			})
		case "toggle":
			return z.boolean().optional()
		case "multiselect":
			return z.array(z.string()).superRefine((value, ctx) => {
				if (definition.required && value.length === 0) {
					ctx.addIssue({ code: "custom", message: "Select at least one option." })
				}
			})
		case "image":
		case "file":
			return z.custom<{ id?: number } | null>().superRefine((value, ctx) => {
				if (definition.required && !value?.id) {
					ctx.addIssue({ code: "custom", message: "This field is required." })
				}
			})
		case "group":
			return z.object(Object.fromEntries(definition.fields.map((child) => [child.name, fieldSchema(child)]))).superRefine((value, ctx) => {
				if (definition.required && !hasPopulatedValue(value)) {
					ctx.addIssue({ code: "custom", message: "Enter at least one value in this group." })
				}
			})
		case "repeater":
			return repeaterSchema(definition)
	}
}

function stringSchema(required: boolean, format?: "email" | "url" | "date"): z.ZodTypeAny {
	return z.string().superRefine((raw, ctx) => {
		const value = (raw ?? "").trim()

		if (required && value === "") {
			ctx.addIssue({ code: "custom", message: "This field is required." })
			return
		}

		if (value === "") return

		if (format === "email" && !z.email().safeParse(value).success) {
			ctx.addIssue({ code: "custom", message: "Enter a valid email address." })
		}
		if (format === "url" && !z.url().safeParse(value).success) {
			ctx.addIssue({ code: "custom", message: "Enter a valid URL." })
		}
		if (format === "date" && !isCalendarDate(value)) {
			ctx.addIssue({ code: "custom", message: "Enter a date (YYYY-MM-DD)." })
		}
	})
}

function refineNumber(value: number, definition: Extract<CustomFieldDefinition, { type: "number" }>, ctx: z.RefinementCtx): void {
	if (definition.min != null && value < definition.min) ctx.addIssue({ code: "custom", message: `Enter at least ${definition.min}.` })
	if (definition.max != null && value > definition.max) ctx.addIssue({ code: "custom", message: `Enter at most ${definition.max}.` })
	if (definition.step != null && definition.step > 0) {
		const origin = definition.min ?? 0
		const quotient = (value - origin) / definition.step
		if (Math.abs(quotient - Math.round(quotient)) > 1e-9) {
			ctx.addIssue({ code: "custom", message: `Use increments of ${definition.step} from ${origin}.` })
		}
	}
}

function isCalendarDate(value: string): boolean {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
	if (!match) return false
	const year = Number(match[1])
	const month = Number(match[2])
	const day = Number(match[3])
	const date = new Date(Date.UTC(year, month - 1, day))
	return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function hasPopulatedValue(value: unknown): boolean {
	if (Array.isArray(value)) return value.some(hasPopulatedValue)
	if (value && typeof value === "object") return Object.values(value).some(hasPopulatedValue)
	return value !== null && value !== undefined && value !== ""
}

function repeaterSchema(definition: Extract<CustomFieldDefinition, { type: "repeater" }>): z.ZodTypeAny {
	const row = z.object(Object.fromEntries(definition.fields.map((child) => [child.name, fieldSchema(child)])))

	return z.array(row).superRefine((rows, ctx) => {
		const min = definition.required ? Math.max(1, definition.min ?? 0) : (definition.min ?? 0)

		if (rows.length < min) {
			ctx.addIssue({ code: "custom", message: `Add at least ${min} row${min === 1 ? "" : "s"}.` })
		}
		if (definition.max != null && rows.length > definition.max) {
			ctx.addIssue({ code: "custom", message: `Add at most ${definition.max} row${definition.max === 1 ? "" : "s"}.` })
		}
	})
}
