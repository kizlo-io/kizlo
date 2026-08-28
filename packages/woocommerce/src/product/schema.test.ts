import { describe, expect, test } from "vitest"
import * as schemas from "./schema"
import {
	ListProductInput,
	ProductAttributeSummary,
	ProductAttributeTermSummary,
	ProductBrandSummary,
	ProductCategorySummary,
	ProductSummary,
	ProductTagSummary,
	ProductTermSummary,
	ProductVariationAttributeSummary,
	ProductVariationSummary,
	RetrieveProductFiltersInput,
	RetrieveProductInput,
} from "./schema"

describe("Product summary schemas", () => {
	test("uses the Summary suffix for every compact relationship", () => {
		expect(ProductTagSummary).toBe(ProductTermSummary)
		expect(ProductBrandSummary).toBe(ProductTermSummary)
		expect(ProductCategorySummary).toBe(ProductTermSummary)
		expect(ProductAttributeSummary.shape.terms.element).toBe(ProductAttributeTermSummary)
		expect(ProductVariationSummary.shape.attributes.element).toBe(ProductVariationAttributeSummary)
		expect(ProductSummary.shape.categories.element).toBe(ProductCategorySummary)
		expect(ProductSummary.shape.tags.element).toBe(ProductTagSummary)
		expect(ProductSummary.shape.brands.element).toBe(ProductBrandSummary)
		expect(ProductSummary.shape.attributes.element).toBe(ProductAttributeSummary)
		expect(ProductSummary.shape.variations.element).toBe(ProductVariationSummary)
	})

	test("does not export the old Ref schema names", () => {
		for (const name of [
			"ProductTermRef",
			"ProductTagRef",
			"ProductBrandRef",
			"ProductCategoryRef",
			"ProductAttributeTermRef",
			"ProductAttributeRef",
			"ProductVariationAttributeRef",
			"ProductVariationRef",
		]) {
			expect(schemas).not.toHaveProperty(name)
		}
	})
})

describe("Product recommendation inputs", () => {
	test("normalizes recommendation query strings to booleans", () => {
		expect(RetrieveProductInput.parse({ identifier: 42, recommendations: "true" }).recommendations).toBe(true)
		expect(ListProductInput.parse({ recommendations: "false" }).recommendations).toBe(false)
	})

	test("keeps the Kizlo-only recommendation option out of product filters", () => {
		expect(RetrieveProductFiltersInput.parse({ recommendations: true })).not.toHaveProperty("recommendations")
	})
})
