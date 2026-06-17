import { createProcedure, deserializeListMetadata, WC_CORE_BASE, WC_STORE_BASE } from "kizlo"
import { GET_PRODUCT_ERROR_MAP, LIST_PRODUCT_ERROR_MAP } from "./error"
import { ListProductInput, Product, ProductFilters, ProductList, RetrieveProductFiltersInput, RetrieveProductInput } from "./schema"
import type { WCK_Product, WCSK_Product, WCSK_ProductCollectionData } from "./types"
import type { WC_ProductListErrorCode, WC_ProductRetrieveErrorCode } from "./types.wc"
import type {
	WCS_ProductCollectionDataErrorCode,
	WCS_ProductCollectionDataInput,
	WCS_ProductsListErrorCode,
	WCS_ProductsListInput,
} from "./types.wcs"
import { deserializeProduct, deserializeProductFilters, deserializeStoreProduct, serializeProductListInput } from "./utils"

export const PRODUCT_ROUTER = {
	get: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/products/{identifier}",
			params: RetrieveProductInput.pick({ identifier: true }),
			query: RetrieveProductInput.pick({ previewToken: true }).optional(),
			output: Product,
			errors: GET_PRODUCT_ERROR_MAP,
		},
		async ({ context, input, errors }) => {
			if (input.query?.previewToken) {
				const result = await context.verifyPreviewToken(input.query.previewToken)
				if (!result) throw errors.PRODUCT_NOT_FOUND()
				const response = await context.service.wordpress.get<WCK_Product, WC_ProductRetrieveErrorCode>(`/products/${result.id}`, {
					base: WC_CORE_BASE,
				})
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
			const response = await context.service.wordpress.get<WCK_Product[], WC_ProductListErrorCode>("/products", {
				searchParams: { slug: input.params.identifier },
				base: WC_CORE_BASE,
			})
			if (response.error) {
				switch (response.error.code) {
					default:
						context.logger.error("Get product unhandled error", response.error, {
							identifier: input.params.identifier,
							code: response.error.code,
						})
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}
			const data = response.data[0]
			if (!data) throw errors.PRODUCT_NOT_FOUND()
			return deserializeProduct(data)
		},
	),
	list: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/products",
			query: ListProductInput.optional(),
			output: ProductList,
			errors: LIST_PRODUCT_ERROR_MAP,
		},
		async ({ context, input, errors }) => {
			const searchParams = serializeProductListInput(input.query)
			const response = await context.service.wordpress.get<WCSK_Product[], WCS_ProductsListErrorCode>("/products", {
				base: WC_STORE_BASE,
				searchParams: { ...searchParams } satisfies WCS_ProductsListInput,
			})
			if (response.error) {
				switch (response.error.code) {
					default:
						context.logger.error("List products unhandled error", response.error, { code: response.error.code })
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}
			const list = context.service.wordpress.resolveList({
				data: response.data,
				headers: response.headers,
				searchParams: { ...searchParams },
			})
			return {
				items: list.items.map(deserializeStoreProduct),
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
			const response = await context.service.wordpress.get<WCSK_ProductCollectionData, WCS_ProductCollectionDataErrorCode>(
				"/products/collection-data",
				{
					base: WC_STORE_BASE,
					searchParams: {
						...searchParams,
						calculate_price_range: true,
						calculate_rating_counts: input.query?.ratingFilters,
						calculate_taxonomy_counts: input.query?.taxonomyFilters,
						calculate_stock_status_counts: input.query?.stockStatusFilters,
						calculate_attribute_counts: input.query?.attributeFilters?.map((item) => ({
							taxonomy: item.taxonomy,
							query_type: item.queryType,
						})),
					} satisfies WCS_ProductCollectionDataInput,
				},
			)
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
