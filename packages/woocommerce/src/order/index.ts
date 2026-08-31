import { createProcedure, schemaType } from "kizlo"
import { sessionMiddleware } from "../session"
import { GET_ORDER_ERROR_MAP } from "./error"
import { GetOrderInput, Order } from "./schema"
import { deserializeOrder } from "./utils"

export const ORDER_PROCEDURES = {
	get: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/orders/{orderId}",
			params: GetOrderInput.pick({ orderId: true }),
			query: GetOrderInput.pick({ key: true, billingEmail: true }).optional(),
			output: schemaType<Order>(Order),
			errors: GET_ORDER_ERROR_MAP,
			middlewares: [sessionMiddleware()],
		},
		async ({ context, input, errors }) => {
			const response = await context.wordpress.woocommerce.store.orders.get(
				{
					id: input.params.orderId,
					key: input.query?.key,
					billing_email: input.query?.billingEmail,
				},
				{ headers: context.sessionHeaders },
			)

			if (response.error) {
				switch (response.error.code) {
					case "woocommerce_rest_invalid_order":
						if (response.status === 404) throw errors.ORDER_NOT_FOUND({ message: response.error.message })
						throw errors.ORDER_FORBIDDEN({ message: response.error.message })
					case "woocommerce_rest_invalid_billing_email":
					case "woocommerce_rest_invalid_user":
						throw errors.ORDER_FORBIDDEN({ message: response.error.message })
					default:
						context.logger.error("Get order unhandled error", response.error, {
							orderId: input.params.orderId,
							code: response.error.code,
						})
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			return deserializeOrder(response.data)
		},
	),
}
