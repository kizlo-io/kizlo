import { MediaImage, NumberLike } from "@kizlo/shared"
import { CurrencyFormat } from "kizlo"
import { z } from "zod/v4"
import {
	CartBillingAddress,
	CartCoupon,
	CartError,
	CartItemData,
	CartItemTotals,
	CartSelectedAttribute,
	CartShippingAddress,
	CartTaxLine,
} from "../cart/schema"
import { ProductCustomFieldsSchema, ProductPrices } from "../product/schema"
import type { ProductCustomFields } from "../product/types"

export const OrderItemProduct = z.object({
	sku: z.string().nullable(),
	slug: z.string(),
	url: z.string().nullable(),
	shortDescription: z.string(),
	description: z.string(),
	images: z.array(MediaImage),
	prices: ProductPrices,
	custom: ProductCustomFieldsSchema,
})
export type OrderItemProduct = Omit<z.infer<typeof OrderItemProduct>, "custom"> & { custom: ProductCustomFields }

export const OrderItem = z.object({
	id: z.number(),
	productId: z.number().nullable(),
	variationId: z.number().nullable(),
	name: z.string(),
	quantity: z.number(),
	selectedAttributes: z.array(CartSelectedAttribute),
	itemData: z.array(CartItemData),
	totals: CartItemTotals,
	product: OrderItemProduct.nullable(),
	extensions: z.record(z.string(), z.unknown()),
})
export type OrderItem = Omit<z.infer<typeof OrderItem>, "product"> & { product: OrderItemProduct | null }

export const OrderFee = z.object({
	id: z.number(),
	name: z.string(),
	totals: z.object({ total: z.number(), tax: z.number() }),
})
export type OrderFee = z.infer<typeof OrderFee>

export const OrderTotals = z.object({
	subtotal: z.number(),
	itemsTotal: z.number(),
	itemsTaxTotal: z.number(),
	feesTotal: z.number(),
	feesTaxTotal: z.number(),
	discountTotal: z.number(),
	discountTaxTotal: z.number(),
	shippingTotal: z.number().nullable(),
	shippingTaxTotal: z.number().nullable(),
	taxTotal: z.number(),
	refundTotal: z.number(),
	total: z.number(),
	taxLines: z.array(CartTaxLine),
})
export type OrderTotals = z.infer<typeof OrderTotals>

export const Order = z.object({
	id: z.number(),
	status: z.string(),
	items: z.array(OrderItem),
	coupons: z.array(CartCoupon),
	fees: z.array(OrderFee),
	billingAddress: CartBillingAddress,
	shippingAddress: CartShippingAddress,
	needsPayment: z.boolean(),
	needsShipping: z.boolean(),
	paymentRequirements: z.array(z.string()),
	errors: z.array(CartError),
	totals: OrderTotals,
	currencyFormat: CurrencyFormat,
})
export type Order = Omit<z.infer<typeof Order>, "items"> & { items: OrderItem[] }

export const GetOrderInput = z.object({
	orderId: NumberLike,
	key: z.string().optional(),
	billingEmail: z.email().optional(),
})
export type GetOrderInput = z.input<typeof GetOrderInput>
