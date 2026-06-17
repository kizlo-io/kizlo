import { createProcedure, WC_CORE_BASE } from "kizlo"
import { Customer } from "./schema"
import type { WC_Customer, WC_CustomerRetrieveErrorCode } from "./types.wc"
import { deserializeCustomer } from "./utils"

export const CUSTOMER_ROUTER = {
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

			const response = await context.service.wordpress.get<WC_Customer, WC_CustomerRetrieveErrorCode>(`/customers/${auth.id}`, {
				base: WC_CORE_BASE,
			})
			if (response.error) throw response.error
			return deserializeCustomer(response.data)
		},
	),
}
