import { MediaImage } from "@kizlo/shared"
import { CurrencyFormat } from "kizlo"
import { describe, expect, test } from "vitest"
import { ProductPrices, ProductSummary } from "../product/schema"
import * as schemas from "./schema"
import { Cart, CartItem, CartShippingPackage, CartShippingRate } from "./schema"

describe("Cart resource schemas", () => {
	test("reuses shared Product and media resource contracts", () => {
		expect(Cart.shape.crossSells.element).toBe(ProductSummary)
		expect(CartItem.shape.images.element).toBe(MediaImage)
		expect(CartItem.shape.prices).toBe(ProductPrices)
		expect(Cart.shape.currencyFormat).toBe(CurrencyFormat)
		expect(CartShippingPackage.shape.rates.element).toBe(CartShippingRate)
	})

	test("models payment methods as presentation objects, not bare IDs", () => {
		const method = { id: "bacs", title: "Direct bank transfer", description: "Pay into our bank account.", order: 0, enabled: true }

		expect(schemas.CartPaymentMethod.safeParse(method).success).toBe(true)
		expect(Cart.shape.paymentMethods.element).toBe(schemas.CartPaymentMethod)

		// The legacy string-array representation is rejected.
		expect(Cart.shape.paymentMethods.safeParse(["bacs", "cod"]).success).toBe(false)

		// Every field is required; incomplete metadata is rejected.
		const { description: _description, ...withoutDescription } = method
		expect(schemas.CartPaymentMethod.safeParse(withoutDescription).success).toBe(false)
		expect(schemas.CartPaymentMethod.safeParse({ ...method, order: "1" }).success).toBe(false)
	})

	test("exports only the redesigned field names", () => {
		for (const name of ["CartLineItemStatus", "CartPackageLine", "CartPackageRate", "CartCouponLine", "CartShippingLine"]) {
			expect(schemas).not.toHaveProperty(name)
		}

		expect(Object.keys(Cart.shape)).toEqual(
			expect.arrayContaining([
				"items",
				"itemCount",
				"billingAddress",
				"shippingAddress",
				"shippingPackages",
				"coupons",
				"fees",
				"crossSells",
				"errors",
				"extensions",
			]),
		)
		expect(Cart.shape).not.toHaveProperty("lineItems")
		expect(CartItem.shape).not.toHaveProperty("status")
		expect(CartItem.shape).not.toHaveProperty("variations")
	})
})
