import { createProcedure, schemaType } from "kizlo"
import { Customer } from "./schema"
import { deserializeCustomer } from "./utils"

export const CUSTOMER_PROCEDURES = {
	get: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/customers",
			output: schemaType<Customer>(Customer),
		},
		async ({ context, errors }) => {
			const session = await context.getSession()
			if (!session) throw errors.FORBIDDEN()

			const response = await context.wordpress.woocommerce.kizlo.customers.retrieve(undefined, {
				headers: { "X-Kizlo-User-Email": session.email },
			})
			if (response.error) {
				switch (response.error.code) {
					case "kizlo_invalid_identity":
						throw errors.UNAUTHORIZED({ message: response.error.message })
					case "kizlo_forbidden_identity":
						throw errors.FORBIDDEN({ message: response.error.message })
					case "kizlo_customer_unavailable":
						throw errors.SERVICE_UNAVAILABLE({ message: response.error.message })
					default:
						context.logger.error("Get customer unhandled error", response.error, { email: session.email, code: response.error.code })
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			return deserializeCustomer(response.data)
		},
	),
}
