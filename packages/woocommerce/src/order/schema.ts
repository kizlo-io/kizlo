import { arrayable, Metadata, NumberLike } from "@kizlo/shared"
import { CurrencyFormat, ListMetadata, Media } from "kizlo"
import z from "zod/v4"
import { BillingAddress, ItemTotals, ShippingAddress, Totals } from "../schema"

export const ORDER_STATUSES = ["pending", "failed", "processing", "on-hold", "completed", "cancelled", "refunded"] as const
export const OrderStatus = z.enum(ORDER_STATUSES)
export type OrderStatus = z.infer<typeof OrderStatus>

export const OrderTaxLine = z.object({
	id: z.number(),
	label: z.string(),
	isCompound: z.boolean(),
	rate: z.number(),
	amount: z.number(),
})
export type OrderTaxLine = z.infer<typeof OrderTaxLine>

export const OrderShippingLine = z.object({
	id: z.number(),
	methodId: z.string(),
	label: z.string(),
	amount: z.number(),
	taxAmount: z.number(),
	total: z.number(),
	taxLines: z.array(OrderTaxLine),
})
export type OrderShippingLine = z.infer<typeof OrderShippingLine>

export const OrderRefundLine = z.object({
	id: z.number(),
	reason: z.string(),
	total: z.number(),
})
export type OrderRefundLine = z.infer<typeof OrderRefundLine>

export const OrderFeeLine = z.object({
	id: z.number(),
	label: z.string(),
	taxClass: z.string(),
	isTaxable: z.boolean(),
	amount: z.number(),
	taxAmount: z.number(),
	total: z.number(),
	taxLines: z.array(OrderTaxLine),
})
export type OrderFeeLine = z.infer<typeof OrderFeeLine>

export const OrderCouponLine = z.object({
	id: z.number(),
	type: z.string(),
	code: z.string(),
	isFreeShipping: z.boolean(),
	baseAmount: z.number(),
	amount: z.number(),
	taxAmount: z.number(),
})
export type OrderCouponLine = z.infer<typeof OrderCouponLine>

export const OrderLineItem = z.object({
	id: z.number(),
	productId: z.number(),
	variationId: z.number().nullable(),
	name: z.string(),
	sku: z.string().nullable(),
	image: Media.nullable(),
	quantity: z.number(),
	totals: ItemTotals,
	taxLines: z.array(OrderTaxLine),
	meta: Metadata,
})
export type OrderLineItem = z.infer<typeof OrderLineItem>

export const Order = z.object({
	id: z.number(),
	key: z.string(),
	number: z.string(),
	parentId: z.number().nullable(),
	status: OrderStatus,
	currency: z.string(),
	orderedAt: z.number(),
	pricesIncludeTax: z.boolean(),
	customerNote: z.string().nullable(),
	billing: BillingAddress,
	shipping: ShippingAddress,
	transactionId: z.string().nullable(),
	paymentMethod: z.string(),
	paymentMethodName: z.string(),
	paidAt: z.number().nullable(),
	completedAt: z.number().nullable(),
	lineItems: z.array(OrderLineItem),
	shippingLines: z.array(OrderShippingLine),
	feeLines: z.array(OrderFeeLine),
	couponLines: z.array(OrderCouponLine),
	refundLines: z.array(OrderRefundLine),
	taxLines: z.array(OrderTaxLine),
	currencyFormat: CurrencyFormat,
	totals: Totals,
	meta: Metadata,
})
export type Order = z.infer<typeof Order>

export const OrderList = z.object({ items: z.array(Order), meta: ListMetadata })
export type OrderList = z.infer<typeof OrderList>

export const RetrieveOrderInput = z.object({
	id: NumberLike,
})
export type RetrieveOrderInput = z.input<typeof RetrieveOrderInput>

export const ORDER_LIST_ORDER_BYES = ["date", "modified", "id", "include", "title", "slug"] as const
export const OrderListOrderBy = z.enum(ORDER_LIST_ORDER_BYES)
export type OrderListOrderBy = z.infer<typeof OrderListOrderBy>

export const ListOrderInput = z.object({
	page: NumberLike.optional(),
	perPage: NumberLike.optional(),
	search: z.string().optional(),
	after: z.string().optional(),
	before: z.string().optional(),
	exclude: arrayable(NumberLike).optional(),
	include: arrayable(NumberLike).optional(),
	offset: NumberLike.optional(),
	order: z.enum(["asc", "desc"]).optional(),
	orderby: OrderListOrderBy.optional(),
	parent: arrayable(NumberLike).optional(),
	parentExclude: arrayable(NumberLike).optional(),
	product: NumberLike.optional(),
})
export type ListOrderInput = z.input<typeof ListOrderInput>
