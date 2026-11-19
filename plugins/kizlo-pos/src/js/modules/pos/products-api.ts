import { apiFetch } from "./api"

export type ProductCard = {
	id: number
	name: string
	type: string
	price: string | null
	stock: "instock" | "outofstock" | "onbackorder"
	stock_quantity: number | null
	image: { url: string | null; alt: string } | null
	matched_variations?: number[]
	regular_price?: string | null
	attributes?: { name: string; options: string[] }[]
}
export type Product = ProductCard & { description: string; sku: string; url: string | null; parent_id: number | null; share_text: string }
export type ProductFilters = { categories: { id: number; name: string }[]; brands: { id: number; name: string }[] }
export type ProductPage = { items: ProductCard[]; page: number; total: number; has_more: boolean; filters?: ProductFilters }

export const getProducts = (search: string, page: number, signal: AbortSignal, filters?: { category: number; brand: number }) =>
	apiFetch<ProductPage>({
		path: `/kizlo-pos/v1/products?${new URLSearchParams({ search, page: String(page), ...(filters ? { category: String(filters.category), brand: String(filters.brand) } : {}) })}`,
		signal,
	})
export const getProduct = (id: number, signal: AbortSignal) => apiFetch<Product>({ path: `/kizlo-pos/v1/products/${id}`, signal })
export const getVariations = (id: number, page: number, signal: AbortSignal) =>
	apiFetch<ProductPage>({ path: `/kizlo-pos/v1/products/${id}/variations?page=${page}`, signal })

export const stockLabel = (stock: ProductCard["stock"]) =>
	({ instock: "In stock", outofstock: "Out of stock", onbackorder: "On backorder" })[stock] ?? "Stock unavailable"

export function mergeProducts(previous: ProductCard[], incoming: ProductCard[]): ProductCard[] {
	return [...new Map([...previous, ...incoming].map((product) => [product.id, product])).values()]
}
