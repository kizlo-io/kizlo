import { describe, expectTypeOf, it } from "vitest"
import type { Product } from "./schema"

describe("site-typed product custom fields", () => {
	it("preserves the generated product field names and values", () => {
		expectTypeOf<Product["custom"]>().toEqualTypeOf<{ product_note: string }>()
	})
})
