import { describe, expectTypeOf, it } from "vitest"
import type { WPK_Seo } from "./seo/types"
import type { WP_EndpointData, WP_EndpointInput } from "./wordpress"

type PostItem = WP_EndpointData<"kizlo.postTypes.post.retrieve">
type PostSeoInput = NonNullable<NonNullable<WP_EndpointInput<"kizlo.postTypes.post.create">["kizlo"]>["seo"]>
type CategorySeoInput = NonNullable<NonNullable<WP_EndpointInput<"kizlo.taxonomies.category.create">["kizlo"]>["seo"]>

type Has<T, K extends PropertyKey> = K extends keyof T ? true : false

describe("per-item SEO", () => {
	it("reads the resolved block back at kizlo.seo", () => {
		expectTypeOf<PostItem["kizlo"]["seo"]>().toEqualTypeOf<WPK_Seo>()
	})

	it("writes the authored overrides at the path it reads them from", () => {
		expectTypeOf<PostSeoInput>().toMatchTypeOf<{
			title?: string
			description?: string
			canonical?: string
			noindex?: boolean
			nofollow?: boolean
			og?: { title?: string; description?: string; image_id?: number }
			twitter?: { title?: string; description?: string; image_id?: number }
		}>()
	})

	it("keeps the write variant out of the response", () => {
		// One key, two types. The response assertion above pins the resolved
		// block, and the authored fields carry none of its shape, so a create
		// that sent SEO still reads back what resolved rather than what it sent.
		expectTypeOf<Has<PostSeoInput, "head">>().toEqualTypeOf<false>()
		expectTypeOf<Has<PostSeoInput, "schema">>().toEqualTypeOf<false>()
		expectTypeOf<Has<WPK_Seo, "title">>().toEqualTypeOf<false>()
	})

	it("offers the schema.org type fields on posts only", () => {
		expectTypeOf<Has<PostSeoInput, "webpage_type">>().toEqualTypeOf<true>()
		expectTypeOf<Has<PostSeoInput, "article_type">>().toEqualTypeOf<true>()

		// A term is always a CollectionPage, so neither field exists on its input.
		expectTypeOf<Has<CategorySeoInput, "webpage_type">>().toEqualTypeOf<false>()
		expectTypeOf<Has<CategorySeoInput, "article_type">>().toEqualTypeOf<false>()

		// What both surfaces do share.
		expectTypeOf<Has<CategorySeoInput, "title">>().toEqualTypeOf<true>()
		expectTypeOf<Has<CategorySeoInput, "og">>().toEqualTypeOf<true>()
	})

	it("leaves every field optional, so a write may carry one override", () => {
		expectTypeOf<{ title: string }>().toMatchTypeOf<PostSeoInput>()
		expectTypeOf<Record<string, never>>().toMatchTypeOf<PostSeoInput>()
	})
})
