import { describe, expectTypeOf, it } from "vitest"
import type { Category, CategoryCustomFields } from "./category/schema"
import type { Page, PageCustomFields } from "./page/schema"
import type { Post, PostCustomFields } from "./post/schema"
import type { Tag, TagCustomFields } from "./tag/schema"
import type { WP_CustomFields } from "./wordpress"

describe("site-typed custom fields", () => {
	it("preserves the generated field names and values on public content models", () => {
		expectTypeOf<Post["custom"]>().toEqualTypeOf<{ company_name: string }>()
		expectTypeOf<Page["custom"]>().toEqualTypeOf<{ featured: boolean }>()
		expectTypeOf<Category["custom"]>().toEqualTypeOf<{ blurb: string }>()
		expectTypeOf<Tag["custom"]>().toEqualTypeOf<{ rank: number | null }>()
	})

	it("maps models through canonical managed-content schemas", () => {
		expectTypeOf<PostCustomFields>().toEqualTypeOf<WP_CustomFields<"postTypes.post">>()
		expectTypeOf<PageCustomFields>().toEqualTypeOf<WP_CustomFields<"postTypes.page">>()
		expectTypeOf<CategoryCustomFields>().toEqualTypeOf<WP_CustomFields<"taxonomies.category">>()
		expectTypeOf<TagCustomFields>().toEqualTypeOf<WP_CustomFields<"taxonomies.postTag">>()
	})
})
