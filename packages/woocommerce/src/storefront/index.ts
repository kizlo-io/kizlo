import { createProcedure } from "kizlo"
import { Storefront } from "./schema"
import { deserializeStorefront } from "./utils"

export const STOREFRONT_PROCEDURES = {
	get: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/storefront",
			output: Storefront,
		},
		async ({ context, errors }) => {
			const response = await context.wordpress.woocommerce.kizlo.storefront.retrieve()
			if (response.error) {
				context.logger.error("Get storefront unhandled error", response.error, { code: response.error.code })
				throw errors.INTERNAL_SERVER_ERROR()
			}

			return deserializeStorefront(response.data)
		},
	),
}
