import { expect, test } from "vitest"
import { ListTagInput } from "./schema"

test("ListTagInput coerces a bad page to 1 instead of throwing", () => {
	expect(ListTagInput.parse({ page: -1 })).toEqual({ page: 1 })
	expect(ListTagInput.parse({ page: "abc" })).toEqual({ page: 1 })
	expect(ListTagInput.parse({ page: "3" })).toEqual({ page: 3 })
})

test("ListTagInput drops an out-of-range perPage instead of throwing", () => {
	expect(ListTagInput.parse({ perPage: 500 })).toEqual({})
	expect(ListTagInput.parse({ perPage: 0 })).toEqual({})
	expect(ListTagInput.parse({ perPage: "20" })).toEqual({ perPage: 20 })
})

test("ListTagInput drops an unknown orderBy but keeps a valid one", () => {
	expect(ListTagInput.parse({ orderBy: "bogus" })).toEqual({})
	expect(ListTagInput.parse({ orderBy: "count" })).toEqual({ orderBy: "count" })
})

test("ListTagInput coerces booleans and arrayable numbers", () => {
	expect(ListTagInput.parse({ hideEmpty: "true" })).toEqual({ hideEmpty: true })
	expect(ListTagInput.parse({ include: "5" })).toEqual({ include: 5 })
	expect(ListTagInput.parse({ include: ["5", "6"] })).toEqual({ include: [5, 6] })
})

test("ListTagInput drops a filter with an uncoercible value", () => {
	expect(ListTagInput.parse({ exclude: ["x", 2] })).toEqual({})
})

test("ListTagInput never throws on a fully invalid query", () => {
	expect(() => ListTagInput.parse({ page: -3, perPage: 9999, orderBy: "nope", hideEmpty: "maybe" })).not.toThrow()
})
