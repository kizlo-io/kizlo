import { deserializeCurrencyFormat, type WP_EndpointInput } from "kizlo"
import { deserializeExtensions, deserializeProductSummary, productCustomFields } from "../product/utils"
import type { Cart, CartBillingAddress, CartShippingAddress, UpdateCartInput } from "./schema"
import type {
	WCK_Cart,
	WCK_CartCoupon,
	WCK_CartFee,
	WCK_CartItem,
	WCK_CartShippingPackage,
	WCK_CartShippingRate,
	WCK_CartTotals,
} from "./types"

type UpdateCustomerInput = WP_EndpointInput<"woocommerce.store.cart.updateCustomer">
type SerializedBillingAddress = NonNullable<UpdateCustomerInput["billing_address"]>
type SerializedShippingAddress = NonNullable<UpdateCustomerInput["shipping_address"]>

const CART_KEYS = [
	"billing_address",
	"coupons",
	"cross_sells",
	"errors",
	"extensions",
	"fees",
	"has_calculated_shipping",
	"items",
	"items_count",
	"items_weight",
	"needs_payment",
	"needs_shipping",
	"payment_methods",
	"payment_requirements",
	"shipping_address",
	"shipping_rates",
	"totals",
] as const satisfies readonly (keyof WCK_Cart)[]

const CART_ITEM_KEYS = [
	"backorders_allowed",
	"catalog_visibility",
	"description",
	"extensions",
	"id",
	"images",
	"item_data",
	"key",
	"low_stock_remaining",
	"name",
	"permalink",
	"prices",
	"quantity",
	"quantity_limits",
	"short_description",
	"show_backorder_badge",
	"sku",
	"sold_individually",
	"totals",
	"type",
	"variation",
] as const satisfies readonly (keyof WCK_CartItem)[]

const CART_ITEM_PRICE_KEYS = [
	"currency_code",
	"currency_decimal_separator",
	"currency_minor_unit",
	"currency_prefix",
	"currency_suffix",
	"currency_symbol",
	"currency_thousand_separator",
	"price",
	"price_range",
	"raw_prices",
	"regular_price",
	"sale_price",
] as const satisfies readonly (keyof WCK_CartItem["prices"])[]

const CART_ITEM_TOTAL_KEYS = [
	"currency_code",
	"currency_decimal_separator",
	"currency_minor_unit",
	"currency_prefix",
	"currency_suffix",
	"currency_symbol",
	"currency_thousand_separator",
	"line_subtotal",
	"line_subtotal_tax",
	"line_total",
	"line_total_tax",
] as const satisfies readonly (keyof WCK_CartItem["totals"])[]

const CART_ITEM_QUANTITY_LIMIT_KEYS = [
	"editable",
	"maximum",
	"minimum",
	"multiple_of",
] as const satisfies readonly (keyof WCK_CartItem["quantity_limits"])[]
const CART_ITEM_VARIATION_KEYS = [
	"attribute",
	"raw_attribute",
	"value",
] as const satisfies readonly (keyof WCK_CartItem["variation"][number])[]
const CART_ITEM_DATA_KEYS = ["display", "name", "value"] as const satisfies readonly (keyof WCK_CartItem["item_data"][number])[]
const CART_ITEM_IMAGE_KEYS = [
	"alt",
	"id",
	"name",
	"sizes",
	"src",
	"srcset",
	"thumbnail",
	"thumbnail_sizes",
	"thumbnail_srcset",
] as const satisfies readonly (keyof WCK_CartItem["images"][number])[]
const CART_ITEM_PRICE_RANGE_KEYS = ["max_amount", "min_amount"] as const satisfies readonly (keyof NonNullable<
	WCK_CartItem["prices"]["price_range"]
>)[]
const CART_ITEM_RAW_PRICE_KEYS = ["precision", "price", "regular_price", "sale_price"] as const satisfies readonly (keyof NonNullable<
	WCK_CartItem["prices"]["raw_prices"]
>)[]

const CART_TOTAL_KEYS = [
	"currency_code",
	"currency_decimal_separator",
	"currency_minor_unit",
	"currency_prefix",
	"currency_suffix",
	"currency_symbol",
	"currency_thousand_separator",
	"tax_lines",
	"total_discount",
	"total_discount_tax",
	"total_fees",
	"total_fees_tax",
	"total_items",
	"total_items_tax",
	"total_price",
	"total_shipping",
	"total_shipping_tax",
	"total_tax",
] as const satisfies readonly (keyof WCK_CartTotals)[]

const CART_COUPON_KEYS = ["code", "discount_type", "totals"] as const satisfies readonly (keyof WCK_CartCoupon)[]
const CART_FEE_KEYS = ["key", "name", "totals"] as const satisfies readonly (keyof WCK_CartFee)[]
const CART_COUPON_TOTAL_KEYS = [
	"currency_code",
	"currency_decimal_separator",
	"currency_minor_unit",
	"currency_prefix",
	"currency_suffix",
	"currency_symbol",
	"currency_thousand_separator",
	"total_discount",
	"total_discount_tax",
] as const satisfies readonly (keyof WCK_CartCoupon["totals"])[]
const CART_FEE_TOTAL_KEYS = [
	"currency_code",
	"currency_decimal_separator",
	"currency_minor_unit",
	"currency_prefix",
	"currency_suffix",
	"currency_symbol",
	"currency_thousand_separator",
	"total",
	"total_tax",
] as const satisfies readonly (keyof WCK_CartFee["totals"])[]
const CART_SHIPPING_PACKAGE_KEYS = [
	"destination",
	"items",
	"name",
	"package_id",
	"shipping_rates",
] as const satisfies readonly (keyof WCK_CartShippingPackage)[]
const CART_SHIPPING_RATE_KEYS = [
	"currency_code",
	"currency_decimal_separator",
	"currency_minor_unit",
	"currency_prefix",
	"currency_suffix",
	"currency_symbol",
	"currency_thousand_separator",
	"delivery_time",
	"description",
	"instance_id",
	"meta_data",
	"method_id",
	"name",
	"price",
	"rate_id",
	"selected",
	"taxes",
] as const satisfies readonly (keyof WCK_CartShippingRate)[]
const CART_SHIPPING_DESTINATION_KEYS = [
	"address_1",
	"address_2",
	"city",
	"country",
	"postcode",
	"state",
] as const satisfies readonly (keyof WCK_CartShippingPackage["destination"])[]
const CART_SHIPPING_ITEM_KEYS = ["key", "name", "quantity"] as const satisfies readonly (keyof WCK_CartShippingPackage["items"][number])[]
const CART_SHIPPING_METADATA_KEYS = ["key", "value"] as const satisfies readonly (keyof WCK_CartShippingRate["meta_data"][number])[]
const CART_TAX_LINE_KEYS = ["name", "price", "rate"] as const satisfies readonly (keyof WCK_CartTotals["tax_lines"][number])[]

function assertNoMissing<_T extends never>(): void {}
assertNoMissing<Exclude<keyof WCK_Cart, (typeof CART_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCK_CartItem, (typeof CART_ITEM_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCK_CartItem["prices"], (typeof CART_ITEM_PRICE_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCK_CartItem["totals"], (typeof CART_ITEM_TOTAL_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCK_CartItem["quantity_limits"], (typeof CART_ITEM_QUANTITY_LIMIT_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCK_CartItem["variation"][number], (typeof CART_ITEM_VARIATION_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCK_CartItem["item_data"][number], (typeof CART_ITEM_DATA_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCK_CartItem["images"][number], (typeof CART_ITEM_IMAGE_KEYS)[number]>>()
assertNoMissing<Exclude<keyof NonNullable<WCK_CartItem["prices"]["price_range"]>, (typeof CART_ITEM_PRICE_RANGE_KEYS)[number]>>()
assertNoMissing<Exclude<keyof NonNullable<WCK_CartItem["prices"]["raw_prices"]>, (typeof CART_ITEM_RAW_PRICE_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCK_CartTotals, (typeof CART_TOTAL_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCK_CartCoupon, (typeof CART_COUPON_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCK_CartFee, (typeof CART_FEE_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCK_CartCoupon["totals"], (typeof CART_COUPON_TOTAL_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCK_CartFee["totals"], (typeof CART_FEE_TOTAL_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCK_CartShippingPackage, (typeof CART_SHIPPING_PACKAGE_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCK_CartShippingRate, (typeof CART_SHIPPING_RATE_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCK_CartShippingPackage["destination"], (typeof CART_SHIPPING_DESTINATION_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCK_CartShippingPackage["items"][number], (typeof CART_SHIPPING_ITEM_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCK_CartShippingRate["meta_data"][number], (typeof CART_SHIPPING_METADATA_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCK_CartTotals["tax_lines"][number], (typeof CART_TAX_LINE_KEYS)[number]>>()

export function deserializeCart(data: WCK_Cart): Cart {
	const { extensions } = deserializeExtensions(data.extensions)

	return {
		items: data.items.map(deserializeCartItem),
		itemCount: data.items_count,
		itemsWeight: data.items_weight,
		billingAddress: deserializeBillingAddress(data.billing_address),
		shippingAddress: deserializeShippingAddress(data.shipping_address),
		shippingPackages: data.shipping_rates.map((pkg) => ({
			id: pkg.package_id,
			name: pkg.name,
			destination: {
				address1: pkg.destination.address_1,
				address2: pkg.destination.address_2,
				city: pkg.destination.city,
				state: pkg.destination.state,
				postcode: pkg.destination.postcode,
				country: pkg.destination.country,
			},
			items: pkg.items.map((item) => ({ key: item.key, name: item.name, quantity: item.quantity })),
			rates: pkg.shipping_rates.map((rate) => ({
				id: rate.rate_id,
				name: rate.name,
				description: rate.description,
				deliveryTime: rate.delivery_time,
				price: Number(rate.price),
				taxes: Number(rate.taxes),
				methodId: rate.method_id,
				instanceId: rate.instance_id,
				metadata: rate.meta_data,
				selected: rate.selected,
			})),
		})),
		coupons: data.coupons.map((coupon) => ({
			code: coupon.code,
			discountType: coupon.discount_type,
			totals: { discount: Number(coupon.totals.total_discount), discountTax: Number(coupon.totals.total_discount_tax) },
		})),
		fees: data.fees.map((fee) => ({
			id: fee.key,
			name: fee.name,
			totals: { total: Number(fee.totals.total), tax: Number(fee.totals.total_tax) },
		})),
		crossSells: data.cross_sells.map((product) => deserializeProductSummary(product)),
		needsPayment: data.needs_payment,
		needsShipping: data.needs_shipping,
		hasCalculatedShipping: data.has_calculated_shipping,
		paymentMethods: data.payment_methods,
		paymentRequirements: data.payment_requirements,
		errors: data.errors,
		totals: {
			itemsTotal: Number(data.totals.total_items),
			itemsTaxTotal: Number(data.totals.total_items_tax),
			feesTotal: Number(data.totals.total_fees),
			feesTaxTotal: Number(data.totals.total_fees_tax),
			discountTotal: Number(data.totals.total_discount),
			discountTaxTotal: Number(data.totals.total_discount_tax),
			shippingTotal: nullableMoney(data.totals.total_shipping),
			shippingTaxTotal: nullableMoney(data.totals.total_shipping_tax),
			total: Number(data.totals.total_price),
			taxTotal: Number(data.totals.total_tax),
			taxLines: data.totals.tax_lines.map((line) => ({ name: line.name, price: Number(line.price), rate: line.rate })),
		},
		currencyFormat: deserializeCurrencyFormat(data.totals),
		extensions,
	}
}

function deserializeCartItem(item: WCK_CartItem): Cart["items"][number] {
	const { extensions, kizlo } = deserializeExtensions(item.extensions)
	const variationId = typeof kizlo.variation_id === "number" ? kizlo.variation_id : 0

	return {
		key: item.key,
		productId: typeof kizlo.product_id === "number" ? kizlo.product_id : item.id,
		variationId: variationId === 0 ? null : variationId,
		type: item.type,
		name: item.name,
		sku: item.sku === "" ? null : item.sku,
		slug: typeof kizlo.slug === "string" ? kizlo.slug : "",
		url: typeof kizlo.url === "string" ? kizlo.url : null,
		shortDescription: item.short_description,
		description: item.description,
		quantity: item.quantity,
		quantityLimits: {
			minimum: item.quantity_limits.minimum,
			maximum: item.quantity_limits.maximum,
			multipleOf: item.quantity_limits.multiple_of,
			editable: item.quantity_limits.editable,
		},
		lowStockRemaining: item.low_stock_remaining,
		allowsBackorders: item.backorders_allowed,
		showsBackorderBadge: item.show_backorder_badge,
		isSoldIndividually: item.sold_individually,
		catalogVisibility: item.catalog_visibility,
		images: item.images.map((image) => ({
			type: "image",
			id: image.id,
			name: image.name,
			alt: image.alt,
			src: image.src,
			srcset: image.srcset,
		})),
		selectedAttributes: item.variation.map((attribute) => ({
			name: attribute.attribute,
			attribute: attribute.raw_attribute,
			value: attribute.value,
		})),
		itemData: item.item_data.map((entry) => ({ name: entry.name, value: entry.value, display: entry.display ?? null })),
		prices: {
			price: Number(item.prices.price),
			regularPrice: Number(item.prices.regular_price),
			salePrice:
				item.prices.sale_price === "" || item.prices.sale_price === item.prices.regular_price ? null : Number(item.prices.sale_price),
			priceRange: item.prices.price_range
				? { minAmount: Number(item.prices.price_range.min_amount), maxAmount: Number(item.prices.price_range.max_amount) }
				: null,
		},
		totals: {
			subtotal: Number(item.totals.line_subtotal),
			subtotalTax: Number(item.totals.line_subtotal_tax),
			total: Number(item.totals.line_total),
			totalTax: Number(item.totals.line_total_tax),
		},
		custom: productCustomFields(kizlo.custom),
		extensions,
	}
}

function deserializeShippingAddress(address: WCK_Cart["shipping_address"]): CartShippingAddress {
	return {
		firstName: address.first_name,
		lastName: address.last_name,
		company: address.company,
		address1: address.address_1,
		address2: address.address_2,
		city: address.city,
		state: address.state,
		postcode: address.postcode,
		country: address.country,
		phone: address.phone,
		additionalFields: additionalAddressFields(address, SHIPPING_ADDRESS_KEYS),
	}
}

function deserializeBillingAddress(address: WCK_Cart["billing_address"]): CartBillingAddress {
	return {
		...deserializeShippingAddress(address),
		email: address.email,
		additionalFields: additionalAddressFields(address, BILLING_ADDRESS_KEYS),
	}
}

const SHIPPING_ADDRESS_KEYS = new Set([
	"first_name",
	"last_name",
	"company",
	"address_1",
	"address_2",
	"city",
	"state",
	"postcode",
	"country",
	"phone",
])
const BILLING_ADDRESS_KEYS = new Set([...SHIPPING_ADDRESS_KEYS, "email"])

function additionalAddressFields(address: Record<string, unknown>, standardKeys: Set<string>): Record<string, string | boolean> {
	return Object.fromEntries(
		Object.entries(address).filter(
			(entry): entry is [string, string | boolean] =>
				!standardKeys.has(entry[0]) && (typeof entry[1] === "string" || typeof entry[1] === "boolean"),
		),
	)
}

export function serializeCartUpdateInput(input: UpdateCartInput): UpdateCustomerInput {
	return {
		...(input.billingAddress !== undefined && { billing_address: serializeBillingAddress(input.billingAddress) }),
		...(input.shippingAddress !== undefined && { shipping_address: serializeShippingAddress(input.shippingAddress) }),
	}
}

function serializeShippingAddress(address: NonNullable<UpdateCartInput["shippingAddress"]>): SerializedShippingAddress {
	return compactAddress({
		...address.additionalFields,
		first_name: address.firstName,
		last_name: address.lastName,
		company: address.company,
		address_1: address.address1,
		address_2: address.address2,
		city: address.city,
		state: address.state,
		postcode: address.postcode,
		country: address.country,
		phone: address.phone,
	})
}

function serializeBillingAddress(address: NonNullable<UpdateCartInput["billingAddress"]>): SerializedBillingAddress {
	return compactAddress({ ...serializeShippingAddress(address), email: address.email })
}

function compactAddress<T extends Record<string, string | boolean | undefined>>(address: T): T {
	return Object.fromEntries(Object.entries(address).filter(([, value]) => value !== undefined)) as T
}

function nullableMoney(value: string | null): number | null {
	return value === null ? null : Number(value)
}
