import { type Media, normalizeArrayableValue, toPublicMetadata } from "@kizlo/shared"
import { deserializeCurrencyFormat, type WP_EndpointInput } from "kizlo"
import {
	type ListProductInputOut,
	PRODUCT_STOCK_STATUSES,
	PRODUCT_TYPES,
	type Product,
	type ProductCategoryRef,
	type ProductFilters,
	type ProductStockStatus,
	type ProductType,
} from "./schema"
import type { WCK_Product, WCSK_Product, WCSK_ProductCollectionData } from "./types"

/** Kizlo takes the rating filter as strings and the Store API takes it as the numbers it enumerates. */
type ProductRatingFilter = NonNullable<WP_EndpointInput<"woocommerce.store.products.list">["rating"]>[number]

export function deserializeProduct(data: WCK_Product): Product {
	return {
		id: data.id,
		type: data.type,
		slug: data.slug,
		name: data.name,
		sku: data.sku,
		description: data.description,
		shortDescription: data.short_description,
		prices: {
			price: data.kizlo.prices.price,
			// Null when the product is not on sale, which `+null` had been turning into a sale at zero.
			salePrice: data.kizlo.prices.sale_price,
			regularPrice: data.kizlo.prices.regular_price,
		},
		isSoldIndividually: data.sold_individually,
		onSaleFrom: data.date_on_sale_from ? toTimestamp(data.date_on_sale_from) : null,
		lowStockRemaining: data.low_stock_amount,
		onSaleTo: data.date_on_sale_to ? toTimestamp(data.date_on_sale_to) : null,
		isInStock: data.stock_status === "instock",
		stock: data.stock_quantity,
		images: deserializeImages(data.images),
		categories: deserializeTermRefs(data.categories),
		tags: deserializeTermRefs(data.tags),
		averageRating: data.average_rating,
		reviewCount: data.rating_count,
		attributes: data.kizlo.attributes.map((item) => ({
			id: item.id,
			hasVariations: item.has_variations,
			name: item.name,
			taxonomy: item.taxonomy,
			terms: item.terms,
		})),
		groupedProducts: data.grouped_products,
		isOnBackorder: data.backordered,
		isPurchasable: data.purchasable,
		isOnSale: data.on_sale,
		parentId: data.parent_id,
		brands: data.brands,
		variations: data.kizlo.variations,
		hasOptions: !!data.kizlo.variations.length,
		currencyFormat: deserializeCurrencyFormat(data.kizlo.currency_format),
		meta: toPublicMetadata(data.meta_data),
		seo: null,
	}
}

export function deserializeStoreProduct(data: WCSK_Product): Product {
	// WooCommerce registers the Store API extension without declaring it required, so the contract
	// admits a product carrying no `kizlo` block. Nothing produces one while this plugin is active,
	// and reading through an empty block beats making every field below optional.
	const kizlo = data.extensions.kizlo ?? { stock: null, on_sale_from: null, on_sale_to: null, hs_code: null }

	return {
		id: data.id,
		type: productType(data.type),
		name: data.name,
		slug: data.slug,
		sku: data.sku,
		description: data.description,
		shortDescription: data.short_description,
		isInStock: data.is_in_stock,
		reviewCount: data.review_count,
		averageRating: data.average_rating,
		lowStockRemaining: data.low_stock_remaining,
		isSoldIndividually: data.sold_individually,
		prices: {
			price: +data.prices.price,
			salePrice: +data.prices.sale_price,
			regularPrice: +data.prices.regular_price,
		},
		images: deserializeImages(data.images),
		categories: deserializeTermRefs(data.categories),
		tags: deserializeTermRefs(data.tags),
		attributes: data.attributes.map((item) => ({
			id: item.id,
			name: item.name,
			terms: item.terms,
			taxonomy: item.taxonomy,
			hasVariations: item.has_variations,
		})),
		currencyFormat: deserializeCurrencyFormat(data.prices),
		brands: data.brands,
		groupedProducts: data.grouped_products,
		hasOptions: data.has_options,
		isOnBackorder: data.is_on_backorder,
		isPurchasable: data.is_purchasable,
		isOnSale: data.on_sale,
		parentId: data.parent,
		variations: data.variations,
		stock: kizlo.stock,
		onSaleFrom: kizlo.on_sale_from ? toTimestamp(kizlo.on_sale_from) : null,
		onSaleTo: kizlo.on_sale_to ? toTimestamp(kizlo.on_sale_to) : null,
		seo: null,
		meta: {},
	}
}

export function deserializeProductFilters(data: WCSK_ProductCollectionData): ProductFilters | null {
	if (!data.price_range) return null

	const maxPrice = +data.price_range.max_price
	const minPrice = +data.price_range.min_price

	return {
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
			image: item.thumbnail
				? {
						id: 0,
						alt: item.name,
						name: item.name,
						src: item.thumbnail,
					}
				: null,
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

export function serializeProductListInput(data?: ListProductInputOut): WP_EndpointInput<"woocommerce.store.products.list"> {
	return {
		after: data?.after,
		attribute_relation: data?.attributeRelation,
		before: data?.before,
		brand: data?.brand,
		brand_operator: data?.brandOperator,
		catalog_visibility: data?.catalogVisibility,
		category: data?.category,
		category_operator: data?.categoryOperator,
		featured: data?.featured,
		max_price: data?.maxPrice ? String(data?.maxPrice) : undefined,
		min_price: data?.minPrice ? String(data?.minPrice) : undefined,
		on_sale: data?.onSale,
		orderby: data?.orderby,
		parent: normalizeArrayableValue(data?.parent),
		parent_exclude: normalizeArrayableValue(data?.parentExclude),
		rating: normalizeArrayableValue(data?.rating)?.map((value) => Number(value) as ProductRatingFilter),
		sku: data?.sku,
		slug: data?.slug,
		stock_status: normalizeArrayableValue(data?.stockStatus),
		tag: data?.tag,
		tag_operator: data?.tagOperator,
		type: data?.type,
		attributes: data?.attributes?.map((item) => ({
			operator: item.operator,
			attribute: item.attribute,
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
}

/**
 * WooCommerce declares both of these fields as plain strings, so the contract cannot narrow them and
 * neither can this without saying what it does with a value it does not recognize.
 *
 * A product type Kizlo has no name for reads as `simple`, which is what every gateway to a product
 * page needs it to behave like. An unrecognized stock status is dropped from the filter list
 * instead: a count nobody can label is not a filter anyone can offer.
 */
function productType(type: string): ProductType {
	return (PRODUCT_TYPES as readonly string[]).includes(type) ? (type as ProductType) : "simple"
}

function stockStatus(status: string): ProductStockStatus | null {
	return (PRODUCT_STOCK_STATUSES as readonly string[]).includes(status) ? (status as ProductStockStatus) : null
}

function deserializeImages(images: { id: number; src: string; name: string; alt: string }[]): Media[] {
	return images.map((item) => ({ id: item.id, src: item.src, name: item.name, alt: item.alt }))
}

function deserializeTermRefs(terms: { id: number; name: string; slug: string }[]): ProductCategoryRef[] {
	return terms.map((term) => ({ id: term.id, name: term.name, slug: term.slug }))
}

function toTimestamp(date: string) {
	return new Date(date).getTime()
}
