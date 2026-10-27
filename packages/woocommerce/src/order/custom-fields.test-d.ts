import { describe, expectTypeOf, it } from "vitest"
import type { ListOrderInput, OrderItemProduct, OrderList } from "./schema"

describe("site-typed order product custom fields", () => {
	it("preserves the generated product field names and values", () => {
		expectTypeOf<OrderItemProduct["custom"]>().toEqualTypeOf<{ product_note: string }>()
		expectTypeOf<OrderList["items"][number]["items"][number]["product"]>().toEqualTypeOf<OrderItemProduct | null>()
		expectTypeOf<OrderList["items"][number]["createdAt"]>().toEqualTypeOf<number>()
		expectTypeOf<OrderList["items"][number]["number"]>().toEqualTypeOf<string>()
	})

	it("keeps owner selectors out of the public list input", () => {
		// @ts-expect-error The authenticated session determines the customer.
		const input: ListOrderInput = { customerId: 123 }
		void input
	})
})
