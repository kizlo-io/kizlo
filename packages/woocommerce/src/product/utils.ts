import { normalizeArrayableValue, timestampFromIso } from "@kizlo/shared"
import { deserializeCurrencyFormat, deserializeSeo, type WP_EndpointInput, type WPK_Seo } from "kizlo"
import {
	type ListProductInputOut,
	PRODUCT_RATINGS,
	PRODUCT_STOCK_STATUSES,
	type Product,
	type ProductFilters,
	type ProductRating,
	type ProductRecommendations,
	type ProductStockStatus,
	type ProductSummary,
} from "./schema"
import type {
	ProductCustomFields,
	WCK_Product,
	WCSK_Product,
	WCSK_ProductCollectionData,
	WCSK_ProductDetail,
	WCSK_ProductSummary,
} from "./types"

type StoreProductListInput = WP_EndpointInput<"woocommerce.store.products.list">
type DynamicTaxonomyInput = Partial<Record<`_unstable_tax_${string}`, string>>
export type SerializedProductListInput = StoreProductListInput & DynamicTaxonomyInput

const STORE_PRODUCT_LIST_INPUT_KEYS = [
	"after",
	"attribute_relation",
	"attributes",
	"before",
	"brand",
	"brand_operator",
	"catalog_visibility",
	"category",
	"category_operator",
	"date_column",
	"exclude",
	"featured",
	"include",
	"max_price",
	"min_price",
	"offset",
	"on_sale",
	"order",
	"orderby",
	"page",
	"parent",
	"parent_exclude",
	"per_page",
	"rating",
	"related",
	"search",
	"sku",
	"slug",
	"stock_status",
	"tag",
	"tag_operator",
	"type",
] as const satisfies readonly (keyof StoreProductListInput)[]

function assertNoMissingStoreProductInputs<_T extends never>(): void {}
assertNoMissingStoreProductInputs<Exclude<keyof StoreProductListInput, (typeof STORE_PRODUCT_LIST_INPUT_KEYS)[number]>>()

export function deserializeProduct(data: WCK_Product): Product {
	return deserializeStoreProduct(data.kizlo.store_product, null)
}

export function deserializeStoreProduct(data: WCSK_Product | WCSK_ProductDetail, recommendations: ProductRecommendations | null): Product {
	const summary = deserializeProductSummary(data)
	const { kizlo } = deserializeExtensions(data.extensions)

	return {
		...summary,
		weight: data.weight,
		dimensions: data.dimensions,
		formattedWeight: data.formatted_weight,
		formattedDimensions: data.formatted_dimensions,
		stockQuantity: nullableNumber(kizlo.stock),
		saleStartsAt: timestampFromIso(typeof kizlo.on_sale_from === "string" ? kizlo.on_sale_from : null),
		saleEndsAt: timestampFromIso(typeof kizlo.on_sale_to === "string" ? kizlo.on_sale_to : null),
		seo: isRecord(kizlo.seo) ? deserializeSeo(kizlo.seo as unknown as WPK_Seo) : null,
		custom: productCustomFields(kizlo.custom),
		recommendations,
	}
}

export function deserializeProductSummary(data: WCSK_Product | WCSK_ProductSummary): ProductSummary {
	const { extensions, kizlo } = deserializeExtensions(data.extensions)
	const termUrls = deserializeTermUrls(kizlo.term_urls)

	return {
		id: data.id,
		name: data.name,
		slug: data.slug,
		parentId: data.parent === 0 ? null : data.parent,
		type: data.type,
		variationDescription: data.variation,
		url: typeof kizlo.url === "string" ? kizlo.url : null,
		sku: data.sku === "" ? null : data.sku,
		shortDescription: data.short_description,
		description: data.description,
		isPasswordProtected: data.is_password_protected,
		isOnSale: data.on_sale,
		prices: {
			price: Number(data.prices.price),
			regularPrice: Number(data.prices.regular_price),
			salePrice: data.on_sale ? Number(data.prices.sale_price) : null,
			priceRange: data.prices.price_range
				? { minAmount: Number(data.prices.price_range.min_amount), maxAmount: Number(data.prices.price_range.max_amount) }
				: null,
		},
		currencyFormat: deserializeCurrencyFormat(data.prices),
		priceHtml: data.price_html,
		averageRating: Number(data.average_rating),
		reviewCount: data.review_count,
		images: data.images.map((image) => ({
			type: "image",
			id: image.id,
			src: image.src,
			srcset: image.srcset,
			name: image.name,
			alt: image.alt,
		})),
		categories: data.categories.map((term) => deserializeTermRef(term, "product_cat", termUrls)),
		tags: data.tags.map((term) => deserializeTermRef(term, "product_tag", termUrls)),
		brands: data.brands.map((term) => deserializeTermRef(term, "product_brand", termUrls)),
		attributes: data.attributes.map((attribute) => ({
			id: attribute.id,
			name: attribute.name,
			taxonomy: attribute.taxonomy ?? null,
			hasVariations: attribute.has_variations,
			terms: attribute.terms.map((term) => ({
				id: term.id,
				name: term.name,
				slug: term.slug,
				isDefault: term.default,
			})),
		})),
		variations: data.variations.map((variation) => ({
			id: variation.id,
			attributes: variation.attributes.map((attribute) => ({ name: attribute.name, value: attribute.value ?? null })),
		})),
		groupedProductIds: data.grouped_products,
		hasOptions: data.has_options,
		isPurchasable: data.is_purchasable,
		isInStock: data.is_in_stock,
		isOnBackorder: data.is_on_backorder,
		stockAvailability: data.stock_availability,
		lowStockRemaining: data.low_stock_remaining,
		isSoldIndividually: data.sold_individually,
		addToCart: {
			text: data.add_to_cart.text,
			description: data.add_to_cart.description,
			singleText: data.add_to_cart.single_text,
			minimum: data.add_to_cart.minimum,
			maximum: data.add_to_cart.maximum,
			multipleOf: data.add_to_cart.multiple_of,
		},
		extensions,
	}
}

export function deserializeProductRecommendations(data: WCSK_ProductDetail): ProductRecommendations {
	return {
		upsells: deserializeEmbeddedProducts(data._embedded?.upsells),
		crossSells: deserializeEmbeddedProducts(data._embedded?.cross_sells),
		related: deserializeEmbeddedProducts(data._embedded?.related),
	}
}

function productCustomFields(value: unknown): ProductCustomFields {
	return (typeof value === "object" && value !== null && !Array.isArray(value) ? value : {}) as ProductCustomFields
}

export function deserializeProductFilters(data: WCSK_ProductCollectionData): ProductFilters | null {
	if (!data.price_range) return null

	const maxPrice = +data.price_range.max_price
	const minPrice = +data.price_range.min_price

	return {
		ratingCounts: (data.rating_counts ?? []).flatMap((entry) =>
			(PRODUCT_RATINGS as readonly number[]).includes(entry.rating) ? [{ count: entry.count, rating: entry.rating as ProductRating }] : [],
		),
		stockStatuses: (data.stock_status_counts ?? []).flatMap((entry) => {
			const status = stockStatus(entry.status)
			return status ? [{ count: entry.count, status }] : []
		}),
		taxonomyTerms: data.kizlo.taxonomy_counts.map((item) => ({
			id: item.id,
			name: item.name,
			count: item.count,
			description: item.description,
			parentId: item.parent,
			slug: item.slug,
			taxonomy: item.taxonomy,
			image: item.image,
		})),
		attributeTerms: data.kizlo.attribute_counts.map((item) => ({
			id: item.id,
			name: item.name,
			count: item.count,
			description: item.description,
			parentId: item.parent,
			slug: item.slug,
			swatch: item.swatch,
			type: item.swatch_type,
			taxonomy: item.taxonomy,
		})),
		priceRange: { maxPrice, minPrice },
		currencyFormat: deserializeCurrencyFormat(data.price_range),
	}
}

export function serializeProductListInput(data?: ListProductInputOut): SerializedProductListInput {
	const searchParams: SerializedProductListInput = {
		after: data?.after,
		attribute_relation: data?.attributeRelation,
		before: data?.before,
		brand: commaSeparated(data?.brand),
		brand_operator: data?.brandOperator,
		catalog_visibility: data?.catalogVisibility,
		category: commaSeparated(data?.category),
		category_operator: data?.categoryOperator,
		date_column: data?.dateColumn,
		featured: data?.featured,
		max_price: data?.maxPrice === undefined ? undefined : String(data.maxPrice),
		min_price: data?.minPrice === undefined ? undefined : String(data.minPrice),
		on_sale: data?.onSale,
		orderby: data?.orderBy,
		parent: normalizeArrayableValue(data?.parent),
		parent_exclude: normalizeArrayableValue(data?.parentExclude),
		rating: normalizeArrayableValue(data?.rating),
		sku: commaSeparated(data?.sku),
		slug: commaSeparated(data?.slug),
		stock_status: normalizeArrayableValue(data?.stockStatus),
		tag: commaSeparated(data?.tag),
		tag_operator: data?.tagOperator,
		type: data?.type as StoreProductListInput["type"],
		attributes: data?.attributes?.map((item) => ({
			operator: item.operator,
			attribute: item.taxonomy,
			slug: normalizeArrayableValue(item.slug),
			term_id: normalizeArrayableValue(item.termId),
		})),
		exclude: normalizeArrayableValue(data?.exclude),
		include: normalizeArrayableValue(data?.include),
		offset: data?.offset,
		order: data?.order,
		page: data?.page,
		per_page: data?.perPage,
		related: data?.related,
		search: data?.search,
	}

	for (const filter of data?.taxonomies ?? []) {
		const key: `_unstable_tax_${string}` = `_unstable_tax_${filter.taxonomy}`
		searchParams[key] = commaSeparated(filter.termIds ?? filter.slugs)
		if (filter.operator !== undefined) searchParams[`${key}_operator`] = filter.operator
	}

	return searchParams
}

function commaSeparated(value: string | number | Array<string | number> | undefined): string | undefined {
	if (value === undefined) return undefined
	return (Array.isArray(value) ? value : [value]).join(",")
}

function stockStatus(status: string): ProductStockStatus | null {
	return (PRODUCT_STOCK_STATUSES as readonly string[]).includes(status) ? (status as ProductStockStatus) : null
}

function deserializeTermRef(term: { id: number; name: string; slug: string }, taxonomy: string, urls: Record<string, string>) {
	return { id: term.id, name: term.name, slug: term.slug, url: urls[`${taxonomy}:${term.id}`] ?? null }
}

function deserializeTermUrls(value: unknown): Record<string, string> {
	if (!Array.isArray(value)) return {}

	return Object.fromEntries(
		value.flatMap((item) => {
			if (!isRecord(item) || typeof item.id !== "number" || typeof item.taxonomy !== "string" || typeof item.url !== "string") return []
			return [[`${item.taxonomy}:${item.id}`, item.url]]
		}),
	)
}
function deserializeEmbeddedProducts(collections: WCSK_ProductSummary[][] | undefined): ProductSummary[] {
	return (collections ?? []).flat().map(deserializeProductSummary)
}

function deserializeExtensions(value: unknown): { extensions: Record<string, unknown>; kizlo: Record<string, unknown> } {
	const all = asRecord(value)
	const { kizlo: rawKizlo, ...extensions } = all

	return { extensions, kizlo: asRecord(rawKizlo) }
}

function asRecord(value: unknown): Record<string, unknown> {
	return isRecord(value) ? value : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function nullableNumber(value: unknown): number | null {
	return typeof value === "number" ? value : null
}
