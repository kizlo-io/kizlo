import type { WP_CustomFields } from "kizlo"
import { describe, expectTypeOf, it } from "vitest"
import type { Product } from "./schema"
import type { ProductCustomFields } from "./types"

describe("site-typed product custom fields", () => {
	it("preserves the generated product field names and values", () => {
		expectTypeOf<Product["custom"]>().toEqualTypeOf<{ product_note: string }>()
	})

	it("uses the canonical managed post-type schema rather than a WooCommerce response envelope", () => {
		expectTypeOf<ProductCustomFields>().toEqualTypeOf<WP_CustomFields<"postTypes.product">>()
	})
})
