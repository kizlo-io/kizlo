import { toPublicMetadata } from "@kizlo/shared"
import { deserializeCurrencyFormat } from "kizlo"
import { calculateLineItemTotals } from "../cart/utils"
import { toCents, toTimestamp } from "../product/utils"
import type { Order, OrderCouponLine, OrderFeeLine, OrderLineItem, OrderShippingLine, OrderStatus, OrderTaxLine } from "./schema"
import type { WCK_Order } from "./types"
import type {
	WC_OrderCouponLine,
	WC_OrderFeeLine,
	WC_OrderLineItem,
	WC_OrderShippingLine,
	WC_OrderStatus,
	WC_OrderTaxLine,
} from "./types.wc"

export function deserializeOrder(data: WCK_Order): Order {
	const orderStatus = ensureOrderStatus(data.status)
	const orderTransactionId = data.transaction_id?.length ? data.transaction_id : null

	const orderFeeLines = data.fee_lines.map((item) => deserializeFeeLine(item, data.tax_lines))
	const orderLineItems = data.line_items.map((item) => deserializeLineItem(item, data.tax_lines))
	const orderShippingLines = data.shipping_lines.map((item) => deserializeShippingLine(item, data.tax_lines))
	const orderTaxLines = data.tax_lines.map((item) => deserializeTaxLine(item))
	const orderCouponLines = data.coupon_lines.map((item) => deserializeCouponLine(item))

	const discountTotal = toCents(data.discount_total)
	const discountTaxTotal = toCents(data.discount_tax)
	const shippingTotal = toCents(data.shipping_total)
	const shippingTaxTotal = toCents(data.shipping_tax)
	const feeTotal = calculate(orderFeeLines, (acc, item) => acc + item.amount)
	const feeTaxTotal = calculate(orderFeeLines, (acc, item) => acc + item.taxAmount)
	const taxTotal = toCents(data.total_tax)
	const total = toCents(data.total)

	return {
		id: data.id,
		status: orderStatus,
		billing: {
			firstName: data.billing.first_name,
			lastName: data.billing.last_name,
			address1: data.billing.address_1,
			city: data.billing.city,
			country: data.billing.country,
			email: data.billing.email,
			phone: data.billing.phone,
			postcode: data.billing.postcode,
			state: data.billing.state,
			address2: data.billing.address_2,
			company: data.billing.company,
		},
		shipping: {
			firstName: data.shipping.first_name,
			lastName: data.shipping.last_name,
			address1: data.shipping.address_1,
			city: data.shipping.city,
			country: data.shipping.country,
			phone: data.shipping.phone,
			postcode: data.shipping.postcode,
			state: data.shipping.state,
			address2: data.shipping.address_2,
			company: data.shipping.company,
		},
		paymentMethodName: data.payment_method_title,
		pricesIncludeTax: data.prices_include_tax,
		transactionId: orderTransactionId,
		lineItems: orderLineItems,
		taxLines: orderTaxLines,
		shippingLines: orderShippingLines,
		couponLines: orderCouponLines,
		feeLines: orderFeeLines,
		currencyFormat: deserializeCurrencyFormat(data.kizlo.currency_format),
		orderedAt: toTimestamp(data.date_created),
		customerNote: data.customer_note.length ? data.customer_note : null,
		completedAt: data.date_completed ? toTimestamp(data.date_completed) : null,
		paidAt: data.date_paid ? toTimestamp(data.date_paid) : null,
		parentId: data.parent_id,
		refundLines: data.refunds.map((a) => ({
			id: a.id,
			reason: a.reason,
			total: toCents(a.total),
		})),
		totals: {
			discountTaxTotal,
			discountTotal,
			feeTaxTotal,
			feeTotal,
			shippingTaxTotal,
			shippingTotal,
			taxTotal,
			total,
		},
		currency: data.currency,
		key: data.order_key,
		number: data.number,
		paymentMethod: data.payment_method,
		meta: toPublicMetadata(data.meta_data),
	}
}

function deserializeLineItem(item: WC_OrderLineItem, orderTaxLines: WC_OrderTaxLine[]): OrderLineItem {
	const totals = calculateLineItemTotals({
		quantity: item.quantity,
		subtotal: toCents(item.subtotal),
		subtotal_tax: toCents(item.subtotal_tax),
		total_tax: toCents(item.total_tax),
		total: toCents(item.total),
	})

	const taxLines = determineTaxLines(
		item.taxes.map((tax) => tax.id),
		orderTaxLines,
	)

	return {
		id: item.id,
		name: item.name,
		sku: item.sku,
		productId: item.product_id,
		variationId: item.variation_id !== 0 ? item.variation_id : null,
		image: item.image ? { id: 0, src: item.image.src, alt: item.name, name: item.name } : null,
		quantity: item.quantity,
		taxLines,
		totals,
		meta: toPublicMetadata(item.meta_data),
	}
}

function deserializeFeeLine(item: WC_OrderFeeLine, orderTaxLines: WC_OrderTaxLine[]): OrderFeeLine {
	return {
		id: item.id,
		label: item.name,
		amount: toCents(item.total),
		taxAmount: toCents(item.total_tax),
		taxLines: determineTaxLines(
			item.taxes.map((a) => a.id),
			orderTaxLines,
		),
		isTaxable: item.tax_status === "taxable",
		taxClass: item.tax_class,
		total: toCents(item.total),
	}
}

function deserializeShippingLine(item: WC_OrderShippingLine, orderTaxLines: WC_OrderTaxLine[]): OrderShippingLine {
	return {
		id: item.id,
		methodId: item.method_id,
		label: item.method_title,
		amount: toCents(item.total),
		taxAmount: toCents(item.total_tax),
		taxLines: determineTaxLines(
			item.taxes.map((tax) => tax.id),
			orderTaxLines,
		),
		total: toCents(item.total) + toCents(item.total_tax),
	}
}

function deserializeCouponLine(item: WC_OrderCouponLine): OrderCouponLine {
	return {
		id: item.id,
		code: item.code,
		type: item.discount_type,
		baseAmount: item.nominal_amount,
		amount: toCents(item.discount),
		isFreeShipping: item.free_shipping,
		taxAmount: toCents(item.discount_tax),
	}
}

function deserializeTaxLine(data: WC_OrderTaxLine): OrderTaxLine {
	return {
		id: data.id,
		rate: data.rate_percent,
		isCompound: data.compound,
		label: data.label.split(" ")[1] ?? "",
		amount: toCents(data.tax_total) + toCents(data.shipping_tax_total),
	}
}

function determineTaxLines(ids: number[], orderTaxLines: WC_OrderTaxLine[]) {
	return orderTaxLines.reduce<OrderTaxLine[]>((acc, item) => {
		if (ids.includes(item.rate_id)) acc.push(deserializeTaxLine(item))
		return acc
	}, [])
}

function ensureOrderStatus(status: WC_OrderStatus): OrderStatus {
	switch (status) {
		case "cancelled":
			return "cancelled"
		case "pending":
		case "completed":
			return "completed"
		case "failed":
			return "failed"
		case "on-hold":
			return "on-hold"
		case "processing":
			return "processing"
		case "refunded":
			return "refunded"
		case "trash":
			return "failed"
	}
}

function calculate<T extends object[]>(items: T, calc: (acc: number, item: T[number]) => number) {
	return items.reduce((acc, item) => acc + calc(acc, item), 0)
}
