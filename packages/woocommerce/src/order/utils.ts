import { deserializeCurrencyFormat } from "kizlo"
import { deserializeCartBillingAddress, deserializeCartShippingAddress } from "../cart/utils"
import { deserializeExtensions, productCustomFields } from "../product/utils"
import type { Order, OrderItem, OrderItemProduct } from "./schema"
import type { WCSK_Order, WCSK_OrderCoupon, WCSK_OrderFee, WCSK_OrderItem, WCSK_OrderTotals } from "./types"

const ORDER_KEYS = [
	"billing_address",
	"coupons",
	"errors",
	"fees",
	"id",
	"items",
	"needs_payment",
	"needs_shipping",
	"payment_requirements",
	"shipping_address",
	"status",
	"totals",
] as const satisfies readonly (keyof WCSK_Order)[]

const ORDER_ITEM_KEYS = [
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
	"variation",
] as const satisfies readonly (keyof WCSK_OrderItem)[]

const ORDER_ITEM_PRICE_KEYS = [
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
] as const satisfies readonly (keyof WCSK_OrderItem["prices"])[]

const ORDER_ITEM_PRICE_RANGE_KEYS = ["max_amount", "min_amount"] as const satisfies readonly (keyof NonNullable<
	WCSK_OrderItem["prices"]["price_range"]
>)[]
const ORDER_ITEM_RAW_PRICE_KEYS = ["precision", "price", "regular_price", "sale_price"] as const satisfies readonly (keyof NonNullable<
	WCSK_OrderItem["prices"]["raw_prices"]
>)[]
const ORDER_ITEM_TOTAL_KEYS = [
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
] as const satisfies readonly (keyof WCSK_OrderItem["totals"])[]
const ORDER_ITEM_QUANTITY_LIMIT_KEYS = [
	"editable",
	"maximum",
	"minimum",
	"multiple_of",
] as const satisfies readonly (keyof WCSK_OrderItem["quantity_limits"])[]
const ORDER_ITEM_VARIATION_KEYS = [
	"attribute",
	"raw_attribute",
	"value",
] as const satisfies readonly (keyof WCSK_OrderItem["variation"][number])[]
const ORDER_ITEM_DATA_KEYS = ["display", "name", "value"] as const satisfies readonly (keyof WCSK_OrderItem["item_data"][number])[]
const ORDER_ITEM_IMAGE_KEYS = [
	"alt",
	"id",
	"name",
	"sizes",
	"src",
	"srcset",
	"thumbnail",
	"thumbnail_sizes",
	"thumbnail_srcset",
] as const satisfies readonly (keyof WCSK_OrderItem["images"][number])[]
const ORDER_COUPON_KEYS = ["code", "discount_type", "totals"] as const satisfies readonly (keyof WCSK_OrderCoupon)[]
const ORDER_COUPON_TOTAL_KEYS = [
	"currency_code",
	"currency_decimal_separator",
	"currency_minor_unit",
	"currency_prefix",
	"currency_suffix",
	"currency_symbol",
	"currency_thousand_separator",
	"total_discount",
	"total_discount_tax",
] as const satisfies readonly (keyof WCSK_OrderCoupon["totals"])[]
const ORDER_FEE_KEYS = ["key", "name", "totals"] as const satisfies readonly (keyof WCSK_OrderFee)[]
const ORDER_FEE_TOTAL_KEYS = [
	"currency_code",
	"currency_decimal_separator",
	"currency_minor_unit",
	"currency_prefix",
	"currency_suffix",
	"currency_symbol",
	"currency_thousand_separator",
	"total",
	"total_tax",
] as const satisfies readonly (keyof WCSK_OrderFee["totals"])[]
const ORDER_TOTAL_KEYS = [
	"currency_code",
	"currency_decimal_separator",
	"currency_minor_unit",
	"currency_prefix",
	"currency_suffix",
	"currency_symbol",
	"currency_thousand_separator",
	"subtotal",
	"tax_lines",
	"total_discount",
	"total_discount_tax",
	"total_fees",
	"total_fees_tax",
	"total_items",
	"total_items_tax",
	"total_price",
	"total_refund",
	"total_shipping",
	"total_shipping_tax",
	"total_tax",
] as const satisfies readonly (keyof WCSK_OrderTotals)[]
const ORDER_TAX_LINE_KEYS = ["name", "price", "rate"] as const satisfies readonly (keyof WCSK_OrderTotals["tax_lines"][number])[]

function assertNoMissing<_T extends never>(): void {}
assertNoMissing<Exclude<keyof WCSK_Order, (typeof ORDER_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCSK_OrderItem, (typeof ORDER_ITEM_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCSK_OrderItem["prices"], (typeof ORDER_ITEM_PRICE_KEYS)[number]>>()
assertNoMissing<Exclude<keyof NonNullable<WCSK_OrderItem["prices"]["price_range"]>, (typeof ORDER_ITEM_PRICE_RANGE_KEYS)[number]>>()
assertNoMissing<Exclude<keyof NonNullable<WCSK_OrderItem["prices"]["raw_prices"]>, (typeof ORDER_ITEM_RAW_PRICE_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCSK_OrderItem["totals"], (typeof ORDER_ITEM_TOTAL_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCSK_OrderItem["quantity_limits"], (typeof ORDER_ITEM_QUANTITY_LIMIT_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCSK_OrderItem["variation"][number], (typeof ORDER_ITEM_VARIATION_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCSK_OrderItem["item_data"][number], (typeof ORDER_ITEM_DATA_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCSK_OrderItem["images"][number], (typeof ORDER_ITEM_IMAGE_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCSK_OrderCoupon, (typeof ORDER_COUPON_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCSK_OrderCoupon["totals"], (typeof ORDER_COUPON_TOTAL_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCSK_OrderFee, (typeof ORDER_FEE_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCSK_OrderFee["totals"], (typeof ORDER_FEE_TOTAL_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCSK_OrderTotals, (typeof ORDER_TOTAL_KEYS)[number]>>()
assertNoMissing<Exclude<keyof WCSK_OrderTotals["tax_lines"][number], (typeof ORDER_TAX_LINE_KEYS)[number]>>()

export function deserializeOrder(data: WCSK_Order): Order {
	return {
		id: data.id,
		status: data.status,
		items: data.items.map(deserializeOrderItem),
		coupons: data.coupons.map((coupon) => ({
			code: coupon.code,
			discountType: coupon.discount_type,
			totals: {
				discount: Number(coupon.totals.total_discount),
				discountTax: Number(coupon.totals.total_discount_tax),
			},
		})),
		fees: data.fees.map((fee) => ({
			id: fee.key,
			name: fee.name,
			totals: { total: Number(fee.totals.total), tax: Number(fee.totals.total_tax) },
		})),
		billingAddress: deserializeCartBillingAddress(data.billing_address),
		shippingAddress: deserializeCartShippingAddress(data.shipping_address),
		needsPayment: data.needs_payment,
		needsShipping: data.needs_shipping,
		paymentRequirements: data.payment_requirements,
		errors: data.errors,
		totals: {
			subtotal: Number(data.totals.subtotal),
			itemsTotal: Number(data.totals.total_items),
			itemsTaxTotal: Number(data.totals.total_items_tax),
			feesTotal: Number(data.totals.total_fees),
			feesTaxTotal: Number(data.totals.total_fees_tax),
			discountTotal: Number(data.totals.total_discount),
			discountTaxTotal: Number(data.totals.total_discount_tax),
			shippingTotal: nullableMoney(data.totals.total_shipping),
			shippingTaxTotal: nullableMoney(data.totals.total_shipping_tax),
			taxTotal: Number(data.totals.total_tax),
			refundTotal: Number(data.totals.total_refund),
			total: Number(data.totals.total_price),
			taxLines: data.totals.tax_lines.map((line) => ({ name: line.name, price: Number(line.price), rate: line.rate })),
		},
		currencyFormat: deserializeCurrencyFormat(data.totals),
	}
}

function deserializeOrderItem(item: WCSK_OrderItem): OrderItem {
	const { extensions, kizlo } = deserializeExtensions(item.extensions)
	const productId = nullableId(kizlo.product_id)
	const variationId = nullableId(kizlo.variation_id)

	return {
		id: item.id,
		productId,
		variationId,
		name: item.name,
		quantity: item.quantity,
		selectedAttributes: item.variation.map((attribute) => ({
			name: attribute.attribute,
			attribute: attribute.raw_attribute,
			value: attribute.value,
		})),
		itemData: item.item_data.map((entry) => ({ name: entry.name, value: entry.value, display: entry.display })),
		totals: {
			subtotal: Number(item.totals.line_subtotal),
			subtotalTax: Number(item.totals.line_subtotal_tax),
			total: Number(item.totals.line_total),
			totalTax: Number(item.totals.line_total_tax),
		},
		product: kizlo.product_exists === true ? deserializeOrderItemProduct(item, kizlo) : null,
		extensions,
	}
}

function deserializeOrderItemProduct(item: WCSK_OrderItem, kizlo: Record<string, unknown>): OrderItemProduct {
	return {
		sku: item.sku === "" ? null : item.sku,
		slug: typeof kizlo.slug === "string" ? kizlo.slug : "",
		url: typeof kizlo.url === "string" ? kizlo.url : null,
		shortDescription: item.short_description,
		description: item.description,
		images: item.images.map((image) => ({
			type: "image",
			id: image.id,
			name: image.name,
			alt: image.alt,
			src: image.src,
			srcset: image.srcset,
		})),
		prices: {
			price: Number(item.prices.price),
			regularPrice: Number(item.prices.regular_price),
			salePrice:
				item.prices.sale_price === "" || item.prices.sale_price === item.prices.regular_price ? null : Number(item.prices.sale_price),
			priceRange: item.prices.price_range
				? { minAmount: Number(item.prices.price_range.min_amount), maxAmount: Number(item.prices.price_range.max_amount) }
				: null,
		},
		custom: productCustomFields(kizlo.custom),
	}
}

function nullableId(value: unknown): number | null {
	return typeof value === "number" && value !== 0 ? value : null
}

function nullableMoney(value: string | null): number | null {
	return value === null ? null : Number(value)
}
