import { createProcedure } from "kizlo"
import { Customer } from "./schema"
import { deserializeCustomer } from "./utils"

export const CUSTOMER_PROCEDURES = {
	get: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/customers",
			output: Customer,
		},
		async ({ context, errors }) => {
			const auth = await context.getAuthUser()
			if (!auth) throw errors.FORBIDDEN()

			const response = await context.wordpress.woocommerce.customers.retrieve({ id: auth.id })
			if (response.error) {
				switch (response.error.code) {
					case "wc_user_invalid_id":
						throw errors.NOT_FOUND()
					case "woocommerce_rest_cannot_view":
						throw errors.FORBIDDEN()
					default:
						context.logger.error("Get customer unhandled error", response.error, { userId: auth.id, code: response.error.code })
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			return deserializeCustomer(response.data)
		},
	),
}
