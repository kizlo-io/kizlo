import type { MediaImage } from "@kizlo/shared"
import { expect, expectTypeOf, test } from "vitest"
import { type CartItem, CartItem as CartItemSchema } from "./cart/schema"
import { type Product, type ProductFiltersTaxonomyTerm, Product as ProductSchema } from "./product/schema"

const image = {
	type: "image" as const,
	id: 12,
	name: "Product",
	src: "https://example.test/product.jpg",
	alt: "Product",
}

test("product and cart images use the shared image member", () => {
	expectTypeOf<Product["images"][number]>().toEqualTypeOf<MediaImage>()
	expectTypeOf<CartItem["images"][number]>().toEqualTypeOf<MediaImage>()
	expectTypeOf<ProductFiltersTaxonomyTerm["image"]>().toEqualTypeOf<MediaImage | null>()
})

test("image collections require the media discriminator", () => {
	expect(ProductSchema.shape.images.element.safeParse(image).success).toBe(true)
	expect(CartItemSchema.shape.images.element.safeParse(image).success).toBe(true)
	expect(ProductSchema.shape.images.element.safeParse({ ...image, type: undefined, thumbnail: image.src }).success).toBe(false)
})
