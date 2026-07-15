import { NumberLike } from "@kizlo/shared"
import z from "zod/v4"

export const LIST_ORDER = ["asc", "desc"] as const
export const ListOrder = z.enum(LIST_ORDER)
export type ListOrder = z.infer<typeof ListOrder>

export const ListMetadata = z.object({
	page: z.number(),
	totalItems: z.number(),
	totalPages: z.number(),
	nextPage: z.number().nullable(),
	prevPage: z.number().nullable(),
	hasNextPage: z.boolean(),
	hasPrevPage: z.boolean(),
})
export type ListMetadata = z.infer<typeof ListMetadata>

export const CurrencyFormat = z.object({
	currencyCode: z.string(),
	currencySymbol: z.string(),
	currencyPrefix: z.string(),
	currencySuffix: z.string(),
	currencyMinorUnit: z.number(),
	currencyDecimalSeparator: z.string(),
	currencyThousandSeparator: z.string(),
})
export type CurrencyFormat = z.infer<typeof CurrencyFormat>

export { Media } from "@kizlo/shared"

export const IdentifierInput = z.union([NumberLike, z.string()])
export type IdentifierInput = z.output<typeof IdentifierInput>

export const PreviewTokenPayload = z.object({
	id: z.number(),
	parent: z.number(),
	expires: z.number(),
})
export type PreviewTokenPayload = z.infer<typeof PreviewTokenPayload>

export const PreviewTokenData = z.object({
	hash: z.string(),
	payload: PreviewTokenPayload,
})
export type PreviewTokenData = z.infer<typeof PreviewTokenData>
