import { describe, expectTypeOf, it } from "vitest"
import type { Category } from "./category/schema"
import type { Page } from "./page/schema"
import type { Post } from "./post/schema"
import type { Tag } from "./tag/schema"

describe("site-typed custom fields", () => {
	it("preserves the generated field names and values on public content models", () => {
		expectTypeOf<Post["custom"]>().toEqualTypeOf<{ company_name: string }>()
		expectTypeOf<Page["custom"]>().toEqualTypeOf<{ featured: boolean }>()
		expectTypeOf<Category["custom"]>().toEqualTypeOf<{ blurb: string }>()
		expectTypeOf<Tag["custom"]>().toEqualTypeOf<{ rank: number | null }>()
	})
})
