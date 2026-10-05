import { deserializeCurrencyFormat } from "kizlo"
import { CoreAddressFieldKeys } from "../address-fields"
import { BillingFieldProjections, isExcludedRegisteredField } from "../field-projections"
import type { Storefront, StorefrontCountry, StorefrontField, StorefrontFieldOverride, StorefrontFieldRule } from "./schema"
import type { WCK_Storefront } from "./types"

type WCK_StorefrontCountry = WCK_Storefront["address"]["countries"][number]
type WCK_StorefrontField = WCK_Storefront["address"]["fields"][number]
type WCK_StorefrontFieldOverride = WCK_StorefrontCountry["locale"][string]

export function deserializeStorefront(data: WCK_Storefront): Storefront {
	const { address, checkout, pricing, catalog } = data
	// Consumers may still generate their contract from an older plugin.
	const pickup: typeof checkout.local_pickup & { method_ids?: unknown } = checkout.local_pickup

	return {
		address: {
			countries: address.countries.map(deserializeCountry),
			defaultAddressFormat: address.default_address_format,
			fields: address.fields.map(deserializeField),
			baseCountry: address.base_country,
			defaultCountry: address.default_country ?? null,
		},
		checkout: {
			allowsGuest: checkout.allows_guest,
			couponsEnabled: checkout.coupons_enabled,
			forcedBillingAddress: checkout.forced_billing_address,
			taxesEnabled: checkout.taxes_enabled,
			displayCartPricesIncludingTax: checkout.display_cart_prices_including_tax,
			displayItemizedTaxes: checkout.display_itemized_taxes,
			shippingEnabled: checkout.shipping_enabled,
			localPickup: {
				enabled: pickup.enabled,
				title: pickup.title,
				cost: pickup.cost,
				methodIds: deserializeMethodIds(pickup.method_ids),
			},
		},
		pricing: {
			currency: deserializeCurrencyFormat(pricing.currency),
			pricesIncludeTax: pricing.prices_include_tax,
			displayShopPricesIncludingTax: pricing.display_shop_prices_including_tax,
			priceSuffix: pricing.price_suffix,
		},
		catalog: {
			weightUnit: catalog.weight_unit,
			dimensionUnit: catalog.dimension_unit,
			reviewsEnabled: catalog.reviews_enabled,
			reviewRatingsEnabled: catalog.review_ratings_enabled,
			reviewRatingRequired: catalog.review_rating_required,
			reviewsVerifiedOwnersOnly: catalog.reviews_verified_owners_only,
			stockFormat: catalog.stock_format,
			hideOutOfStock: catalog.hide_out_of_stock,
			placeholderImage: catalog.placeholder_image,
			cartRedirectAfterAdd: catalog.cart_redirect_after_add,
		},
	}
}

function deserializeMethodIds(value: unknown): string[] | null {
	return Array.isArray(value) && Array.from(value).every((id) => typeof id === "string") ? [...value] : null
}

function deserializeCountry(country: WCK_StorefrontCountry): StorefrontCountry {
	return {
		code: country.code,
		name: country.name,
		allowBilling: country.allowBilling,
		allowShipping: country.allowShipping,
		states: country.states,
		locale: Object.fromEntries(Object.entries(country.locale).map(([key, override]) => [key, deserializeOverride(override)])),
		format: country.format,
	}
}

function deserializeOverride(override: WCK_StorefrontFieldOverride): StorefrontFieldOverride {
	return {
		...(typeof override.label === "string" && { label: override.label }),
		...(typeof override.required === "boolean" && { required: override.required }),
		...(typeof override.hidden === "boolean" && { hidden: override.hidden }),
		...(typeof override.index === "number" && { index: override.index }),
	}
}

function deserializeField(field: WCK_StorefrontField): StorefrontField {
	return {
		id: field.id,
		location: field.location,
		attributes: field.attributes ?? {},
		schema: field.schema,
		bindings: fieldBindings(field.id, field.location),
		label: field.label,
		optionalLabel: field.optionalLabel,
		required: deserializeRule(field.required),
		hidden: deserializeRule(field.hidden),
		type: field.type ?? null,
		autocomplete: field.autocomplete ?? null,
		index: field.index ?? null,
		placeholder: field.placeholder ?? null,
		options: field.options ?? [],
	}
}

function deserializeRule(rule: unknown): StorefrontFieldRule {
	if (typeof rule === "boolean") return rule
	return typeof rule === "object" && rule !== null && !Array.isArray(rule) ? (rule as Record<string, unknown>) : false
}

function fieldBindings(id: string, location: StorefrontField["location"]): StorefrontField["bindings"] {
	if (location !== "address") return { other: id === "email" ? ["billingAddress", "email"] : ["additionalFields", id] }
	const core = Object.hasOwn(CoreAddressFieldKeys, id) ? CoreAddressFieldKeys[id as keyof typeof CoreAddressFieldKeys] : undefined
	const projection = Object.entries(BillingFieldProjections).find(([, entry]) => entry.id === id)
	return {
		billing: core ? [core] : projection ? [projection[0]] : ["additionalFields", id],
		...(!isExcludedRegisteredField(id, "shipping") && { shipping: core ? [core] : ["additionalFields", id] }),
	}
}
