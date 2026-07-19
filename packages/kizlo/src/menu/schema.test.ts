import { expect, test } from "vitest"
import { ListMenuInput } from "./schema"

test("ListMenuInput coerces a bad page to 1 instead of throwing", () => {
	expect(ListMenuInput.parse({ page: -1 })).toEqual({ page: 1 })
	expect(ListMenuInput.parse({ page: "abc" })).toEqual({ page: 1 })
	expect(ListMenuInput.parse({ page: "3" })).toEqual({ page: 3 })
})

test("ListMenuInput drops an out-of-range perPage instead of throwing", () => {
	expect(ListMenuInput.parse({ perPage: 500 })).toEqual({})
	expect(ListMenuInput.parse({ perPage: 0 })).toEqual({})
	expect(ListMenuInput.parse({ perPage: "20" })).toEqual({ perPage: 20 })
})

test("ListMenuInput drops an unknown orderby but keeps a valid one", () => {
	expect(ListMenuInput.parse({ orderby: "bogus" })).toEqual({})
	expect(ListMenuInput.parse({ orderby: "menu_order" })).toEqual({ orderby: "menu_order" })
})

test("ListMenuInput drops the edit-only `modified` orderby", () => {
	expect(ListMenuInput.parse({ orderby: "modified" })).toEqual({})
})

test("ListMenuInput drops a filter with an uncoercible value", () => {
	expect(ListMenuInput.parse({ menus: ["x", 2] })).toEqual({})
	expect(ListMenuInput.parse({ searchColumns: ["post_title", "nope"] })).toEqual({})
})

test("ListMenuInput coerces arrayable numbers", () => {
	expect(ListMenuInput.parse({ menus: "5" })).toEqual({ menus: 5 })
	expect(ListMenuInput.parse({ menus: ["5", "6"] })).toEqual({ menus: [5, 6] })
})

test("ListMenuInput never throws on a fully invalid query", () => {
	expect(() =>
		ListMenuInput.parse({ page: -3, perPage: 9999, orderby: "nope", menus: ["bad"], order: "sideways", taxRelation: "MAYBE" }),
	).not.toThrow()
})
