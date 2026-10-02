import { deserializeCurrencyFormat } from "kizlo"
import type { Storefront, StorefrontCountry, StorefrontField, StorefrontFieldOverride, StorefrontFieldRule } from "./schema"
import type { WCK_Storefront } from "./types"

type WCK_StorefrontCountry = WCK_Storefront["address"]["countries"][number]
type WCK_StorefrontField = WCK_Storefront["address"]["fields"][string]
type WCK_StorefrontFieldOverride = WCK_StorefrontCountry["locale"][string]

export function deserializeStorefront(data: WCK_Storefront): Storefront {
	const { address, checkout, pricing, catalog } = data

	return {
		address: {
			countries: address.countries.map(deserializeCountry),
			defaultAddressFormat: address.default_address_format,
			fields: Object.fromEntries(Object.entries(address.fields).map(([key, field]) => [key, deserializeField(field)])),
			fieldLocations: address.field_locations,
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
			localPickup: checkout.local_pickup,
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
