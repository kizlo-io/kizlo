import { MediaImage } from "@kizlo/shared"
import { CurrencyFormat } from "kizlo"
import { describe, expect, test } from "vitest"
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
import { ProductPrices } from "../product/schema"
import { Order, OrderItem, OrderItemProduct } from "./schema"

describe("Order resource schemas", () => {
	test("reuses finalized cart, product, media, and currency contracts", () => {
		expect(Order.shape.coupons.element).toBe(CartCoupon)
		expect(Order.shape.billingAddress).toBe(CartBillingAddress)
		expect(Order.shape.shippingAddress).toBe(CartShippingAddress)
		expect(Order.shape.errors.element).toBe(CartError)
		expect(Order.shape.totals.shape.taxLines.element).toBe(CartTaxLine)
		expect(Order.shape.currencyFormat).toBe(CurrencyFormat)
		expect(OrderItem.shape.selectedAttributes.element).toBe(CartSelectedAttribute)
		expect(OrderItem.shape.itemData.element).toBe(CartItemData)
		expect(OrderItem.shape.totals).toBe(CartItemTotals)
		expect(OrderItemProduct.shape.images.element).toBe(MediaImage)
		expect(OrderItemProduct.shape.prices).toBe(ProductPrices)
	})

	test("keeps credentials and live storefront transport fields private", () => {
		expect(Order.shape).not.toHaveProperty("key")
		expect(Order.shape).not.toHaveProperty("metadata")
		expect(OrderItem.shape).not.toHaveProperty("key")
		expect(OrderItem.shape).not.toHaveProperty("permalink")
		expect(OrderItem.shape).not.toHaveProperty("quantityLimits")
		expect(OrderItemProduct.shape).not.toHaveProperty("rawPrices")
	})
})
