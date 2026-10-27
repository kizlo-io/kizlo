import { createMiddleware, createProcedure, deserializeListMetadata, schemaType } from "kizlo"
import { sessionMiddleware } from "../session"
import { GET_ORDER_ERROR_MAP } from "./error"
import { GetOrderInput, ListOrderInput, Order, OrderList } from "./schema"
import { deserializeOrder } from "./utils"

export const ORDER_PROCEDURES = {
	list: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/orders",
			query: ListOrderInput.optional(),
			output: schemaType<OrderList>(OrderList),
			middlewares: [
				createMiddleware(async ({ context, next }) => {
					context.headers?.set("Cache-Control", "private, no-store")
					return next()
				}),
				sessionMiddleware({ allowGuest: false }),
			],
		},
		async ({ context, input, errors }) => {
			const query = { page: input.query?.page ?? 1, per_page: input.query?.perPage ?? 10 }
			const response = await context.wordpress.woocommerce.kizlo.orders.list({ query }, { headers: context.sessionHeaders })
			if (response.error) {
				if (response.status === 401) throw errors.UNAUTHORIZED()
				if (response.status === 403) throw errors.FORBIDDEN()
				if (response.status === 400) throw errors.BAD_REQUEST({ message: response.error.message })
				context.logger.error("List orders unhandled error", response.error, { code: response.error.code })
				throw errors.INTERNAL_SERVER_ERROR()
			}
			const list = context.wordpress.resolveList({ data: response.data, headers: response.headers, searchParams: query })
			return { items: list.items.map(deserializeOrder), meta: deserializeListMetadata(list.meta) }
		},
	),
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
			const response = await context.wordpress.woocommerce.store.order.retrieve(
				{
					params: { id: String(input.params.orderId) },
					query: { key: input.query?.key, billing_email: input.query?.billingEmail },
				},
				{ headers: context.sessionHeaders },
			)

			// The handler codes below are not in the generated error union: a discovered route declares no handler
			// errors, so the union narrows to WordPress's pre-dispatch codes. Widening the code is what lets the
			// switches in this file keep handling them, and it goes away with KIZ-207, which registers them.
			if (response.error) {
				switch (response.error.code as string) {
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
