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
			const session = await context.getSession()
			if (!session) throw errors.FORBIDDEN()

			// `role` defaults to `customer` on this endpoint, so a signed-in user with any other WordPress
			// role (subscriber, shop_manager, ...) would be filtered out. `all` matches the old retrieve-by-id
			// behaviour, which never looked at the role.
			const response = await context.wordpress.woocommerce.customers.list({ email: session.email, role: "all" })
			if (response.error) {
				switch (response.error.code) {
					case "woocommerce_rest_cannot_view":
						throw errors.FORBIDDEN()
					default:
						context.logger.error("Get customer unhandled error", response.error, { email: session.email, code: response.error.code })
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			const customer = response.data[0]
			if (!customer) throw errors.NOT_FOUND()

			return deserializeCustomer(customer)
		},
	),
}
