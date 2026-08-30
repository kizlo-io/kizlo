import { arrayable, BooleanLike, MediaImage, NumberLike } from "@kizlo/shared"
import { CurrencyFormat, customFieldsSchema, IdentifierInput, ListMetadata, Seo } from "kizlo"
import { z } from "zod/v4"
import type { ProductCustomFields } from "./types"

export const SWATCH_TYPES = ["text", "color", "image"] as const
export const SwatchType = z.enum(SWATCH_TYPES)
export type SwatchType = z.infer<typeof SwatchType>

export const PRODUCT_TYPES = ["simple", "grouped", "external", "variable", "variation"] as const
export const ProductType = z.enum(PRODUCT_TYPES)
export type ProductType = z.infer<typeof ProductType>

export const ProductTermSummary = z.object({
	id: z.number(),
	name: z.string(),
	slug: z.string(),
	url: z.string().nullable(),
})
export type ProductTermSummary = z.infer<typeof ProductTermSummary>

export const ProductTagSummary = ProductTermSummary
export type ProductTagSummary = z.infer<typeof ProductTagSummary>

export const ProductBrandSummary = ProductTermSummary
export type ProductBrandSummary = z.infer<typeof ProductBrandSummary>

export const ProductCategorySummary = ProductTermSummary
export type ProductCategorySummary = z.infer<typeof ProductCategorySummary>

export const ProductAttributeTermSummary = z.object({
	id: z.number(),
	name: z.string(),
	slug: z.string(),
	isDefault: z.boolean(),
})
export type ProductAttributeTermSummary = z.infer<typeof ProductAttributeTermSummary>

export const ProductAttributeSummary = z.object({
	id: z.number(),
	name: z.string(),
	taxonomy: z.string().nullable(),
	hasVariations: z.boolean(),
	terms: z.array(ProductAttributeTermSummary),
})
export type ProductAttributeSummary = z.infer<typeof ProductAttributeSummary>

export const ProductVariationAttributeSummary = z.object({
	name: z.string(),
	value: z.string().nullable(),
})
export type ProductVariationAttributeSummary = z.infer<typeof ProductVariationAttributeSummary>

export const ProductVariationSummary = z.object({
	id: z.number(),
	attributes: z.array(ProductVariationAttributeSummary),
})
export type ProductVariationSummary = z.infer<typeof ProductVariationSummary>

export const ProductPriceRange = z.object({
	minAmount: z.number(),
	maxAmount: z.number(),
})
export type ProductPriceRange = z.infer<typeof ProductPriceRange>

export const ProductPrices = z.object({
	price: z.number(),
	regularPrice: z.number(),
	salePrice: z.number().nullable(),
	priceRange: ProductPriceRange.nullable(),
})
export type ProductPrices = z.infer<typeof ProductPrices>

export const ProductStockAvailability = z.object({
	text: z.string(),
	class: z.string(),
})
export type ProductStockAvailability = z.infer<typeof ProductStockAvailability>

export const ProductDimensions = z.object({
	length: z.string(),
	width: z.string(),
	height: z.string(),
})
export type ProductDimensions = z.infer<typeof ProductDimensions>

export const ProductAddToCart = z.object({
	text: z.string(),
	description: z.string(),
	singleText: z.string(),
	minimum: z.number(),
	maximum: z.number(),
	multipleOf: z.number(),
})
export type ProductAddToCart = z.infer<typeof ProductAddToCart>

export const ProductExtensions = z.record(z.string(), z.unknown())
export type ProductExtensions = z.infer<typeof ProductExtensions>

export const ProductSummary = z.object({
	id: z.number(),
	name: z.string(),
	slug: z.string(),
	parentId: z.number().nullable(),
	type: z.string(),
	variationDescription: z.string(),
	url: z.string().nullable(),
	sku: z.string().nullable(),
	shortDescription: z.string(),
	description: z.string(),
	isPasswordProtected: z.boolean(),
	isOnSale: z.boolean(),
	prices: ProductPrices,
	currencyFormat: CurrencyFormat,
	priceHtml: z.string(),
	averageRating: z.number(),
	reviewCount: z.number(),
	images: z.array(MediaImage),
	categories: z.array(ProductCategorySummary),
	tags: z.array(ProductTagSummary),
	brands: z.array(ProductBrandSummary),
	attributes: z.array(ProductAttributeSummary),
	variations: z.array(ProductVariationSummary),
	groupedProductIds: z.array(z.number()),
	hasOptions: z.boolean(),
	isPurchasable: z.boolean(),
	isInStock: z.boolean(),
	isOnBackorder: z.boolean(),
	stockAvailability: ProductStockAvailability,
	lowStockRemaining: z.number().nullable(),
	isSoldIndividually: z.boolean(),
	addToCart: ProductAddToCart,
	extensions: ProductExtensions,
})
export type ProductSummary = z.infer<typeof ProductSummary>

export const ProductRecommendations = z.object({
	upsells: z.array(ProductSummary),
	crossSells: z.array(ProductSummary),
	related: z.array(ProductSummary),
})
export type ProductRecommendations = z.infer<typeof ProductRecommendations>

export const ProductCustomFieldsSchema: z.ZodType<ProductCustomFields, ProductCustomFields> = customFieldsSchema<ProductCustomFields>()

export const Product = ProductSummary.extend({
	weight: z.string(),
	dimensions: ProductDimensions,
	formattedWeight: z.string(),
	formattedDimensions: z.string(),
	stockQuantity: z.number().nullable(),
	saleStartsAt: z.number().nullable(),
	saleEndsAt: z.number().nullable(),
	seo: Seo.nullable(),
	custom: ProductCustomFieldsSchema,
	recommendations: ProductRecommendations.nullable(),
})
export type Product = Omit<z.infer<typeof Product>, "custom"> & { custom: ProductCustomFields }

export const ProductList = z.object({ items: z.array(Product), meta: ListMetadata })
export type ProductList = Omit<z.infer<typeof ProductList>, "items"> & { items: Product[] }

export const RetrieveProductInput = z.object({
	identifier: IdentifierInput,
	previewToken: z.string().optional(),
	recommendations: BooleanLike.optional(),
})
export type RetrieveProductInput = z.input<typeof RetrieveProductInput>

const PRODUCTS_ORDER_BYS = [
	"date",
	"modified",
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

export const PRODUCT_DATE_COLUMNS = ["date", "date_gmt", "modified", "modified_gmt"] as const
export const ProductDateColumn = z.enum(PRODUCT_DATE_COLUMNS)
export type ProductDateColumn = z.infer<typeof ProductDateColumn>

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

export const PRODUCT_RATINGS = [1, 2, 3, 4, 5] as const
export const ProductRating = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
export type ProductRating = z.infer<typeof ProductRating>

const ProductRatingInput = NumberLike.pipe(ProductRating)
const ProductTermIdentifier = z.union([NumberLike, z.string()])
const ProductTaxonomyName = z
	.string()
	.min(1)
	.regex(/^[a-z0-9_-]+$/)
	.refine((name) => !name.endsWith("_operator"))

export const ProductAttributeFilter = z.object({
	taxonomy: z.string(),
	slug: arrayable(z.string()).optional(),
	termId: arrayable(NumberLike).optional(),
	operator: ProductTaxonomyOperator.optional(),
})
export type ProductAttributeFilter = z.input<typeof ProductAttributeFilter>

export const ProductTaxonomyFilter = z
	.object({
		taxonomy: ProductTaxonomyName,
		termIds: arrayable(NumberLike).optional(),
		slugs: arrayable(z.string()).optional(),
		operator: ProductTaxonomyOperator.optional(),
	})
	.refine((filter) => (filter.termIds === undefined) !== (filter.slugs === undefined), {
		message: "Provide either termIds or slugs.",
	})
export type ProductTaxonomyFilter = z.input<typeof ProductTaxonomyFilter>

export const ListProductInput = z.object({
	page: NumberLike.optional(),
	perPage: NumberLike.optional(),
	search: z.string().optional(),
	recommendations: BooleanLike.optional(),
	slug: arrayable(z.string()).optional(),
	after: z.string().optional(),
	before: z.string().optional(),
	dateColumn: ProductDateColumn.optional(),
	exclude: arrayable(NumberLike).optional(),
	include: arrayable(NumberLike).optional(),
	offset: NumberLike.optional(),
	order: z.enum(["asc", "desc"]).optional(),
	orderBy: ProductOrderBy.optional(),
	parent: arrayable(NumberLike).optional(),
	parentExclude: arrayable(NumberLike).optional(),
	type: z.string().optional(),
	sku: arrayable(z.string()).optional(),
	featured: BooleanLike.optional(),
	category: arrayable(ProductTermIdentifier).optional(),
	categoryOperator: ProductTaxonomyOperator.optional(),
	brand: arrayable(ProductTermIdentifier).optional(),
	brandOperator: ProductTaxonomyOperator.optional(),
	tag: arrayable(ProductTermIdentifier).optional(),
	tagOperator: ProductTaxonomyOperator.optional(),
	onSale: BooleanLike.optional(),
	minPrice: NumberLike.optional(),
	maxPrice: NumberLike.optional(),
	stockStatus: arrayable(ProductStockStatus).optional(),
	attributes: z.array(ProductAttributeFilter).optional(),
	attributeRelation: ProductAttributeRelation.optional(),
	catalogVisibility: ProductCatalogVisibility.optional(),
	rating: arrayable(ProductRatingInput).optional(),
	related: NumberLike.optional(),
	taxonomies: z.array(ProductTaxonomyFilter).optional(),
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

export const ProductFiltersRatingCount = z.object({
	count: z.number(),
	rating: ProductRating,
})
export type ProductFiltersRatingCount = z.infer<typeof ProductFiltersRatingCount>

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
	image: MediaImage.nullable(),
})
export type ProductFiltersTaxonomyTerm = z.infer<typeof ProductFiltersTaxonomyTerm>

export const ProductFiltersAttributeTerm = ProductFiltersTerm.extend({
	type: SwatchType,
	swatch: z.string().nullable(),
})
export type ProductFiltersAttributeTerm = z.infer<typeof ProductFiltersAttributeTerm>

export const ProductFilters = z.object({
	priceRange: ProductFiltersPriceRange,
	ratingCounts: z.array(ProductFiltersRatingCount),
	stockStatuses: z.array(ProductFiltersStockStatus),
	attributeTerms: z.array(ProductFiltersAttributeTerm),
	taxonomyTerms: z.array(ProductFiltersTaxonomyTerm),
	currencyFormat: CurrencyFormat,
})
export type ProductFilters = z.infer<typeof ProductFilters>

export const ProductAttributeCount = z.object({
	taxonomy: z.string(),
	operator: z.enum(["or", "and"]).optional(),
})
export type ProductAttributeCount = z.input<typeof ProductAttributeCount>

export const RetrieveProductFiltersInput = ListProductInput.omit({ recommendations: true }).extend({
	ratingCounts: BooleanLike.optional(),
	stockStatusCounts: BooleanLike.optional(),
	taxonomyCounts: z.array(z.string()).optional(),
	attributeCounts: z.array(ProductAttributeCount).optional(),
})
export type RetrieveProductFiltersInput = z.input<typeof RetrieveProductFiltersInput>
export type RetrieveProductFiltersInputOut = z.output<typeof RetrieveProductFiltersInput>
