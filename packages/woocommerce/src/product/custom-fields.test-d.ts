import { describe, expectTypeOf, it } from "vitest"
import type { Product } from "./schema"
import type { ProductCustomFields, WCSK_Product } from "./types"

describe("site-typed product custom fields", () => {
	it("preserves the generated product field names and values", () => {
		expectTypeOf<Product["custom"]>().toEqualTypeOf<{ product_note: string }>()
	})

	it("uses the same introspected custom-field shape for REST previews and Store products", () => {
		type StoreCustomFields = NonNullable<WCSK_Product["extensions"]["kizlo"]>["custom"]

		expectTypeOf<StoreCustomFields>().toEqualTypeOf<ProductCustomFields>()
	})
})
