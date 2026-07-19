import { expect, test } from "vitest"
import { ListCategoryInput } from "./schema"

test("ListCategoryInput coerces a bad page to 1 instead of throwing", () => {
	expect(ListCategoryInput.parse({ page: -1 })).toEqual({ page: 1 })
	expect(ListCategoryInput.parse({ page: "abc" })).toEqual({ page: 1 })
	expect(ListCategoryInput.parse({ page: "3" })).toEqual({ page: 3 })
})

test("ListCategoryInput drops an out-of-range perPage instead of throwing", () => {
	expect(ListCategoryInput.parse({ perPage: 500 })).toEqual({})
	expect(ListCategoryInput.parse({ perPage: 0 })).toEqual({})
	expect(ListCategoryInput.parse({ perPage: "20" })).toEqual({ perPage: 20 })
})

test("ListCategoryInput drops an unknown orderBy but keeps a valid one", () => {
	expect(ListCategoryInput.parse({ orderBy: "bogus" })).toEqual({})
	expect(ListCategoryInput.parse({ orderBy: "count" })).toEqual({ orderBy: "count" })
})

test("ListCategoryInput coerces booleans and arrayable numbers", () => {
	expect(ListCategoryInput.parse({ hideEmpty: "true" })).toEqual({ hideEmpty: true })
	expect(ListCategoryInput.parse({ include: "5" })).toEqual({ include: 5 })
	expect(ListCategoryInput.parse({ include: ["5", "6"] })).toEqual({ include: [5, 6] })
})

test("ListCategoryInput drops a filter with an uncoercible value", () => {
	expect(ListCategoryInput.parse({ parent: "x" })).toEqual({})
	expect(ListCategoryInput.parse({ exclude: ["x", 2] })).toEqual({})
})

test("ListCategoryInput never throws on a fully invalid query", () => {
	expect(() => ListCategoryInput.parse({ page: -3, perPage: 9999, orderBy: "nope", parent: "bad", hideEmpty: "maybe" })).not.toThrow()
})
