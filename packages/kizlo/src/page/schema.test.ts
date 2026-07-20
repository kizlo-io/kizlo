import { expect, test } from "vitest"
import { ListPageInput } from "./schema"

test("ListPageInput coerces a bad page to 1 instead of throwing", () => {
	expect(ListPageInput.parse({ page: -1 })).toEqual({ page: 1 })
	expect(ListPageInput.parse({ page: "abc" })).toEqual({ page: 1 })
	expect(ListPageInput.parse({ page: "3" })).toEqual({ page: 3 })
})

test("ListPageInput drops an out-of-range perPage instead of throwing", () => {
	expect(ListPageInput.parse({ perPage: 500 })).toEqual({})
	expect(ListPageInput.parse({ perPage: 0 })).toEqual({})
	expect(ListPageInput.parse({ perPage: "20" })).toEqual({ perPage: 20 })
})

test("ListPageInput drops an unknown orderby but keeps a valid one", () => {
	expect(ListPageInput.parse({ orderby: "bogus" })).toEqual({})
	expect(ListPageInput.parse({ orderby: "menu_order" })).toEqual({ orderby: "menu_order" })
})

test("ListPageInput drops a filter with an uncoercible value", () => {
	expect(ListPageInput.parse({ author: ["x", 2] })).toEqual({})
	expect(ListPageInput.parse({ searchColumns: ["post_title", "nope"] })).toEqual({})
})

test("ListPageInput coerces arrayable numbers for hierarchy filters", () => {
	expect(ListPageInput.parse({ parent: "5" })).toEqual({ parent: 5 })
	expect(ListPageInput.parse({ parent: ["5", "6"] })).toEqual({ parent: [5, 6] })
	expect(ListPageInput.parse({ parentExclude: "7" })).toEqual({ parentExclude: 7 })
	expect(ListPageInput.parse({ menuOrder: "2" })).toEqual({ menuOrder: 2 })
})

test("ListPageInput keeps a valid mix of hierarchy and paging filters", () => {
	expect(ListPageInput.parse({ page: "2", perPage: "10", parent: "3", orderby: "menu_order", order: "asc", slug: "about" })).toEqual({
		page: 2,
		perPage: 10,
		parent: 3,
		orderby: "menu_order",
		order: "asc",
		slug: "about",
	})
})

test("ListPageInput never throws on a fully invalid query", () => {
	expect(() => ListPageInput.parse({ page: -3, perPage: 9999, orderby: "nope", author: ["bad"], parent: ["x"] })).not.toThrow()
})
