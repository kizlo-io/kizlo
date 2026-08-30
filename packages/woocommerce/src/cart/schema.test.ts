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
