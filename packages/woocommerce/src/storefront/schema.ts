import { CurrencyFormat } from "kizlo"
import z from "zod"

/**
 * A plugin-registered field may make `required` or `hidden` a JSON Schema rule evaluated against the
 * checkout rather than a fixed boolean.
 */
export const StorefrontFieldRule = z.union([z.boolean(), z.record(z.string(), z.unknown())])
export type StorefrontFieldRule = z.infer<typeof StorefrontFieldRule>

export const StorefrontFieldOption = z.object({
	value: z.string(),
	label: z.string(),
})
export type StorefrontFieldOption = z.infer<typeof StorefrontFieldOption>

export const StorefrontField = z.object({
	label: z.string(),
	optionalLabel: z.string(),
	required: StorefrontFieldRule,
	hidden: StorefrontFieldRule,
	type: z.string().nullable(),
	autocomplete: z.string().nullable(),
	index: z.number().nullable(),
	placeholder: z.string().nullable(),
	options: z.array(StorefrontFieldOption),
})
export type StorefrontField = z.infer<typeof StorefrontField>

/** What a country changes about a field. Anything it leaves out keeps the field's default. */
export const StorefrontFieldOverride = z.object({
	label: z.string().optional(),
	required: z.boolean().optional(),
	hidden: z.boolean().optional(),
	index: z.number().optional(),
})
export type StorefrontFieldOverride = z.infer<typeof StorefrontFieldOverride>

export const StorefrontCountry = z.object({
	code: z.string(),
	name: z.string(),
	allowBilling: z.boolean(),
	allowShipping: z.boolean(),
	states: z.array(z.object({ code: z.string(), name: z.string() })),
	locale: z.record(z.string(), StorefrontFieldOverride),
	format: z.string(),
})
export type StorefrontCountry = z.infer<typeof StorefrontCountry>

export const StorefrontAddress = z.object({
	countries: z.array(StorefrontCountry),
	defaultAddressFormat: z.string(),
	fields: z.record(z.string(), StorefrontField),
	fieldLocations: z.object({
		address: z.array(z.string()),
		contact: z.array(z.string()),
		order: z.array(z.string()),
	}),
	baseCountry: z.string(),
	defaultCountry: z.string().nullable(),
})
export type StorefrontAddress = z.infer<typeof StorefrontAddress>

export const StorefrontCheckout = z.object({
	allowsGuest: z.boolean(),
	couponsEnabled: z.boolean(),
	forcedBillingAddress: z.boolean(),
	taxesEnabled: z.boolean(),
	displayCartPricesIncludingTax: z.boolean(),
	displayItemizedTaxes: z.boolean(),
	shippingEnabled: z.boolean(),
	localPickup: z.object({
		enabled: z.boolean(),
		title: z.string(),
		cost: z.string(),
	}),
})
export type StorefrontCheckout = z.infer<typeof StorefrontCheckout>

export const StorefrontPricing = z.object({
	currency: CurrencyFormat,
	pricesIncludeTax: z.boolean(),
	displayShopPricesIncludingTax: z.boolean(),
	priceSuffix: z.string(),
})
export type StorefrontPricing = z.infer<typeof StorefrontPricing>

export const StorefrontCatalog = z.object({
	weightUnit: z.string(),
	dimensionUnit: z.string(),
	reviewsEnabled: z.boolean(),
	reviewRatingsEnabled: z.boolean(),
	reviewRatingRequired: z.boolean(),
	reviewsVerifiedOwnersOnly: z.boolean(),
	stockFormat: z.string(),
	hideOutOfStock: z.boolean(),
	placeholderImage: z.string(),
	cartRedirectAfterAdd: z.boolean(),
})
export type StorefrontCatalog = z.infer<typeof StorefrontCatalog>

export const Storefront = z.object({
	address: StorefrontAddress,
	checkout: StorefrontCheckout,
	pricing: StorefrontPricing,
	catalog: StorefrontCatalog,
})
export type Storefront = z.infer<typeof Storefront>
