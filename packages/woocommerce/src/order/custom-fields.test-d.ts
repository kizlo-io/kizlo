import { describe, expectTypeOf, it } from "vitest"
import type { OrderItemProduct } from "./schema"

describe("site-typed order product custom fields", () => {
	it("preserves the generated product field names and values", () => {
		expectTypeOf<OrderItemProduct["custom"]>().toEqualTypeOf<{ product_note: string }>()
	})
})
