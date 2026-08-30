import { createProcedure, deserializeListMetadata, schemaType } from "kizlo"
import { GET_PRODUCT_ERROR_MAP, LIST_PRODUCT_ERROR_MAP } from "./error"
import { ListProductInput, Product, ProductFilters, ProductList, RetrieveProductFiltersInput, RetrieveProductInput } from "./schema"
import {
	deserializeProduct,
	deserializeProductFilters,
	deserializeProductRecommendations,
	deserializeStoreProduct,
	serializeProductListInput,
} from "./utils"

const PRODUCT_EMBEDS = "upsells,cross_sells,related"

export const PRODUCT_PROCEDURES = {
	get: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/products/{identifier}",
			params: RetrieveProductInput.pick({ identifier: true }),
			query: RetrieveProductInput.pick({ previewToken: true, recommendations: true }).optional(),
			output: schemaType<Product>(Product),
			errors: GET_PRODUCT_ERROR_MAP,
		},
		async ({ context, input, errors }) => {
			if (input.query?.previewToken) {
				const result = await context.verifyPreviewToken(input.query.previewToken)
				if (!result) throw errors.PRODUCT_NOT_FOUND()
				const response = await context.wordpress.woocommerce.products.retrieve({ id: Number(result.id) })
				if (response.error) {
					switch (response.error.code) {
						case "woocommerce_rest_product_invalid_id":
							throw errors.PRODUCT_NOT_FOUND({ message: response.error.message })
						default:
							context.logger.error("Get product preview unhandled error", response.error, { id: result.id, code: response.error.code })
							throw errors.INTERNAL_SERVER_ERROR()
					}
				}
				return deserializeProduct(response.data)
			}
			const identifier = input.params.identifier
			const includeRecommendations = input.query?.recommendations ?? false
			const embeds = includeRecommendations ? { _embed: PRODUCT_EMBEDS } : {}
			const response =
				typeof identifier === "number"
					? await context.wordpress.woocommerce.store.products.getById({ id: identifier, ...embeds })
					: await context.wordpress.woocommerce.store.products.getBySlug({ slug: identifier, ...embeds })
			if (response.error) {
				switch (response.error.code) {
					case "woocommerce_rest_product_invalid_id":
					case "woocommerce_rest_product_invalid_slug":
						throw errors.PRODUCT_NOT_FOUND({ message: response.error.message })
					default:
						context.logger.error("Get product unhandled error", response.error, {
							identifier,
							code: response.error.code,
						})
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			return deserializeStoreProduct(response.data, includeRecommendations ? deserializeProductRecommendations(response.data) : null)
		},
	),
	list: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/products",
			query: ListProductInput.optional(),
			output: schemaType<ProductList>(ProductList),
			errors: LIST_PRODUCT_ERROR_MAP,
		},
		async ({ context, input, errors }) => {
			const searchParams = serializeProductListInput(input.query)
			const includeRecommendations = input.query?.recommendations ?? false
			const embeds = includeRecommendations ? { _embed: PRODUCT_EMBEDS } : {}
			const response = await context.wordpress.woocommerce.store.products.list({ ...searchParams, ...embeds })
			if (response.error) {
				switch (response.error.code) {
					default:
						context.logger.error("List products unhandled error", response.error, { code: response.error.code })
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}
			const list = context.wordpress.resolveList({
				data: response.data,
				headers: response.headers,
				searchParams: { ...searchParams },
			})
			return {
				items: list.items.map((item) =>
					deserializeStoreProduct(item, includeRecommendations ? deserializeProductRecommendations(item) : null),
				),
				meta: deserializeListMetadata(list.meta),
			}
		},
	),
	filters: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/products/filters",
			query: RetrieveProductFiltersInput.optional(),
			output: ProductFilters.nullable(),
		},
		async ({ context, errors, input }) => {
			const searchParams = serializeProductListInput(input.query)
			const response = await context.wordpress.woocommerce.store.products.collectionData({
				...searchParams,
				calculate_price_range: true,
				calculate_rating_counts: input.query?.ratingCounts,
				calculate_taxonomy_counts: input.query?.taxonomyCounts,
				calculate_stock_status_counts: input.query?.stockStatusCounts,
				calculate_attribute_counts: input.query?.attributeCounts?.map((item) => ({
					taxonomy: item.taxonomy,
					query_type: item.operator,
				})),
			})
			if (response.error) {
				switch (response.error.code) {
					default:
						context.logger.error("Filter products unhandled error", response.error, { code: response.error.code })
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}
			return deserializeProductFilters(response.data)
		},
	),
}
