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
			const response = await context.wordpress.woocommerce.customers.list({ query: { email: session.email, role: "all" } })
			// The handler codes below are not in the generated error union: a discovered route declares no handler
			// errors, so the union narrows to WordPress's pre-dispatch codes. Widening the code is what lets the
			// switches in this file keep handling them, and it goes away with KIZ-207, which registers them.
			if (response.error) {
				switch (response.error.code as string) {
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
