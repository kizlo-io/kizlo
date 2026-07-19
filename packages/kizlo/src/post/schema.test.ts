import { expect, test } from "vitest"
import { ListPostInput } from "./schema"

test("ListPostInput coerces a bad page to 1 instead of throwing", () => {
	expect(ListPostInput.parse({ page: -1 })).toEqual({ page: 1 })
	expect(ListPostInput.parse({ page: "abc" })).toEqual({ page: 1 })
	expect(ListPostInput.parse({ page: "3" })).toEqual({ page: 3 })
})

test("ListPostInput drops an out-of-range perPage instead of throwing", () => {
	expect(ListPostInput.parse({ perPage: 500 })).toEqual({})
	expect(ListPostInput.parse({ perPage: 0 })).toEqual({})
	expect(ListPostInput.parse({ perPage: "20" })).toEqual({ perPage: 20 })
})

test("ListPostInput drops an unknown orderby but keeps a valid one", () => {
	expect(ListPostInput.parse({ orderby: "bogus" })).toEqual({})
	expect(ListPostInput.parse({ orderby: "modified" })).toEqual({ orderby: "modified" })
})

test("ListPostInput drops a filter with an uncoercible value", () => {
	expect(ListPostInput.parse({ author: ["x", 2] })).toEqual({})
	expect(ListPostInput.parse({ searchColumns: ["post_title", "nope"] })).toEqual({})
})

test("ListPostInput coerces booleans and arrayable numbers", () => {
	expect(ListPostInput.parse({ sticky: "true" })).toEqual({ sticky: true })
	expect(ListPostInput.parse({ categories: "5" })).toEqual({ categories: 5 })
	expect(ListPostInput.parse({ categories: ["5", "6"] })).toEqual({ categories: [5, 6] })
})

test("ListPostInput never throws on a fully invalid query", () => {
	expect(() => ListPostInput.parse({ page: -3, perPage: 9999, orderby: "nope", author: ["bad"], sticky: "maybe" })).not.toThrow()
})
