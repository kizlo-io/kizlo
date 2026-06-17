import { arrayable, BooleanLike, Metadata, NumberLike } from "@kizlo/shared"
import { CurrencyFormat, IdentifierInput, ListMetadata, Media, Seo } from "kizlo"
import { z } from "zod/v4"

export const SWATCH_TYPES = ["text", "color", "image"] as const
export const SwatchType = z.enum(SWATCH_TYPES)
export type SwatchType = z.infer<typeof SwatchType>

const PRODUCT_TYPES = ["simple", "grouped", "external", "variable", "variation"] as const
export const ProductType = z.enum(PRODUCT_TYPES)
export type ProductType = z.infer<typeof ProductType>

export const ProductTagRef = z.object({
	id: z.number(),
	name: z.string(),
	slug: z.string(),
})
export type ProductTagRef = z.infer<typeof ProductTagRef>

export const ProductBrandRef = z.object({
	id: z.number(),
	name: z.string(),
	slug: z.string(),
})
export type ProductBrandRef = z.infer<typeof ProductBrandRef>

export const ProductAttributeTermRef = z.object({
	id: z.number(),
	name: z.string(),
	slug: z.string(),
})
export type ProductAttributeTermRef = z.infer<typeof ProductAttributeTermRef>

export const ProductAttributeRef = z.object({
	id: z.number(),
	name: z.string(),
	taxonomy: z.string(),
	hasVariations: z.boolean(),
	terms: z.array(ProductAttributeTermRef),
})
export type ProductAttributeRef = z.infer<typeof ProductAttributeRef>

export const ProductCategoryRef = z.object({
	id: z.number(),
	name: z.string(),
	slug: z.string(),
})
export type ProductCategoryRef = z.infer<typeof ProductCategoryRef>

export const ProductVariationAttributeRef = z.object({
	name: z.string(),
	value: z.string(),
})
export type ProductVariationAttributeRef = z.infer<typeof ProductVariationAttributeRef>

export const ProductVariationRef = z.object({
	id: z.number(),
	attributes: z.array(ProductVariationAttributeRef),
})
export type ProductVariationRef = z.infer<typeof ProductVariationRef>

export const ProductPrices = z.object({
	price: z.number(),
	salePrice: z.number().nullable(),
	regularPrice: z.number(),
})
export type ProductPrices = z.infer<typeof ProductPrices>

export const Product = z.object({
	id: z.number(),
	parentId: z.number(),
	type: ProductType,
	name: z.string(),
	slug: z.string(),
	sku: z.string().nullable(),
	shortDescription: z.string(),
	description: z.string(),
	onSaleFrom: z.number().nullable(),
	onSaleTo: z.number().nullable(),
	isOnSale: z.boolean(),
	prices: ProductPrices,
	averageRating: z.string(),
	reviewCount: z.number(),
	images: z.array(Media),
	categories: z.array(ProductCategoryRef),
	tags: z.array(ProductTagRef),
	brands: z.array(ProductBrandRef),
	attributes: z.array(ProductAttributeRef),
	variations: z.array(ProductVariationRef),
	groupedProducts: z.array(z.number()),
	isSoldIndividually: z.boolean(),
	hasOptions: z.boolean(),
	isPurchasable: z.boolean(),
	isInStock: z.boolean(),
	isOnBackorder: z.boolean(),
	stock: z.number().nullable(),
	lowStockRemaining: z.number().nullable(),
	seo: Seo.nullable(),
	currencyFormat: CurrencyFormat,
	meta: Metadata,
})
export type Product = z.infer<typeof Product>

export const ProductList = z.object({ items: z.array(Product), meta: ListMetadata })
export type ProductList = z.infer<typeof ProductList>

export const RetrieveProductInput = z.object({
	identifier: IdentifierInput,
	previewToken: z.string().optional(),
})
export type RetrieveProductInput = z.input<typeof RetrieveProductInput>

const PRODUCTS_ORDER_BYS = [
	"date",
	"id",
	"include",
	"title",
	"slug",
	"price",
	"popularity",
	"rating",
	"menu_order",
	"comment_count",
] as const

export const ProductOrderBy = z.enum(PRODUCTS_ORDER_BYS)
export type ProductOrderBy = z.infer<typeof ProductOrderBy>

const PRODUCT_TAXONOMY_OPERATORS = ["in", "not_in", "and"] as const
export const ProductTaxonomyOperator = z.enum(PRODUCT_TAXONOMY_OPERATORS)
export type ProductTaxonomyOperator = z.infer<typeof ProductTaxonomyOperator>

export const PRODUCT_ATTRIBUTE_RELATIONS = ["in", "and"] as const
export const ProductAttributeRelation = z.enum(PRODUCT_ATTRIBUTE_RELATIONS)
export type ProductAttributeRelation = z.infer<typeof ProductAttributeRelation>

export const PRODUCT_STOCK_STATUSES = ["instock", "outofstock", "onbackorder"] as const
export const ProductStockStatus = z.enum(PRODUCT_STOCK_STATUSES)
export type ProductStockStatus = z.infer<typeof ProductStockStatus>

export const PRODUCT_CATALOG_VISIBILITIES = ["any", "visible", "catalog", "search", "hidden"] as const
export const ProductCatalogVisibility = z.enum(PRODUCT_CATALOG_VISIBILITIES)
export type ProductCatalogVisibility = z.infer<typeof ProductCatalogVisibility>

export const PRODUCT_RATINGS = ["1", "2", "3", "4", "5"] as const
export const ProductRating = z.enum(PRODUCT_RATINGS)
export type ProductRating = z.infer<typeof ProductRating>

export const ProductAttributeFilter = z.object({
	attribute: z.string().optional(),
	slug: arrayable(z.string()).optional(),
	termId: arrayable(NumberLike).optional(),
	operator: ProductTaxonomyOperator.optional(),
})
export type ProductAttributeFilter = z.input<typeof ProductAttributeFilter>

export const ListProductInput = z.object({
	page: NumberLike.optional(),
	perPage: NumberLike.optional(),
	search: z.string().optional(),
	slug: z.string().optional(),
	after: z.string().optional(),
	before: z.string().optional(),
	exclude: arrayable(NumberLike).optional(),
	include: arrayable(NumberLike).optional(),
	offset: NumberLike.optional(),
	order: z.enum(["asc", "desc"]).optional(),
	orderby: ProductOrderBy.optional(),
	parent: arrayable(NumberLike).optional(),
	parentExclude: arrayable(NumberLike).optional(),
	type: ProductType.optional(),
	sku: z.string().optional(),
	featured: BooleanLike.optional(),
	category: z.string().optional(),
	categoryOperator: ProductTaxonomyOperator.optional(),
	brand: z.string().optional(),
	brandOperator: ProductTaxonomyOperator.optional(),
	tag: z.string().optional(),
	tagOperator: ProductTaxonomyOperator.optional(),
	onSale: BooleanLike.optional(),
	minPrice: z.string().optional(),
	maxPrice: z.string().optional(),
	stockStatus: arrayable(ProductStockStatus).optional(),
	attributes: z.array(ProductAttributeFilter).optional(),
	attributeRelation: ProductAttributeRelation.optional(),
	catalogVisibility: ProductCatalogVisibility.optional(),
	rating: arrayable(ProductRating).optional(),
	related: NumberLike.optional(),
})
export type ListProductInput = z.input<typeof ListProductInput>
export type ListProductInputOut = z.output<typeof ListProductInput>

// ====================================================
// FILTERS
// ====================================================

export const ProductFiltersPriceRange = z.object({
	minPrice: z.number(),
	maxPrice: z.number(),
})
export type ProductFiltersPriceRange = z.infer<typeof ProductFiltersPriceRange>

export const ProductFiltersStockStatus = z.object({
	count: z.number(),
	status: ProductStockStatus,
})
export type ProductFiltersStockStatus = z.infer<typeof ProductFiltersStockStatus>

export const ProductFiltersTerm = z.object({
	id: z.number(),
	parentId: z.number().nullable(),
	name: z.string(),
	slug: z.string(),
	taxonomy: z.string(),
	description: z.string(),
	count: z.number(),
})
export type ProductFiltersTerm = z.infer<typeof ProductFiltersTerm>

export const ProductFiltersTaxonomyTerm = ProductFiltersTerm.extend({
	image: Media.nullable(),
})
export type ProductFiltersTaxonomyTerm = z.infer<typeof ProductFiltersTaxonomyTerm>

export const ProductFiltersAttributeTerm = ProductFiltersTerm.extend({
	type: SwatchType,
	swatch: z.string().nullable(),
})
export type ProductFiltersAttributeTerm = z.infer<typeof ProductFiltersAttributeTerm>

export const ProductFilters = z.object({
	priceRange: ProductFiltersPriceRange,
	stockStatuses: z.array(ProductFiltersStockStatus),
	attributeTerms: z.array(ProductFiltersAttributeTerm),
	taxonomyTerms: z.array(ProductFiltersTaxonomyTerm),
	currencyFormat: CurrencyFormat,
})
export type ProductFilters = z.infer<typeof ProductFilters>

export const CalculateAttributeFilter = z.object({
	taxonomy: z.string(),
	queryType: z.enum(["or", "and"]).optional(),
})
export type CalculateAttributeFilter = z.input<typeof CalculateAttributeFilter>

export const RetrieveProductFiltersInput = ListProductInput.extend({
	ratingFilters: BooleanLike.optional(),
	stockStatusFilters: BooleanLike.optional(),
	taxonomyFilters: z.array(z.string()).optional(),
	attributeFilters: z.array(CalculateAttributeFilter).optional(),
})
export type RetrieveProductFiltersInput = z.input<typeof RetrieveProductFiltersInput>
export type RetrieveProductFiltersInputOut = z.output<typeof RetrieveProductFiltersInput>
