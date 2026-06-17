import { createProcedure, deserializeListMetadata, emptyList, WC_CORE_BASE } from "kizlo"
import { GET_ORDER_ERROR_MAP, LIST_ORDER_ERROR_MAP } from "./error"
import { ListOrderInput, Order, OrderList, RetrieveOrderInput } from "./schema"
import type { WCK_Order } from "./types"
import type { WC_OrderListErrorCode, WC_OrderListInput, WC_OrderRetrieveErrorCode } from "./types.wc"
import { deserializeOrder } from "./utils"

export const ORDER_ROUTER = {
	get: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/orders/{id}",
			params: RetrieveOrderInput.pick({ id: true }),
			output: Order,
			errors: GET_ORDER_ERROR_MAP,
		},
		async ({ context, input, errors }) => {
			const auth = await context.getAuthUser()
			if (!auth) throw errors.FORBIDDEN()

			const response = await context.service.wordpress.get<WCK_Order, WC_OrderRetrieveErrorCode>(`/orders/${input.params.id}`, {
				base: WC_CORE_BASE,
			})

			if (response.error) {
				switch (response.error.code) {
					case "woocommerce_rest_shop_order_invalid_id":
						throw errors.ORDER_NOT_FOUND({ message: response.error.message })
					case "woocommerce_rest_cannot_view":
						throw errors.FORBIDDEN({ message: response.error.message })
					default:
						context.logger.error("Get order unhandled error", response.error, { id: input.params.id, code: response.error.code })
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			if (response.data.customer_id !== auth.id) throw errors.FORBIDDEN()

			return deserializeOrder(response.data)
		},
	),

	list: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/orders",
			query: ListOrderInput,
			output: OrderList,
			errors: LIST_ORDER_ERROR_MAP,
		},
		async ({ context, input, errors }) => {
			const auth = await context.getAuthUser()
			if (!auth) throw errors.FORBIDDEN()

			const response = await context.service.wordpress.get<WCK_Order[], WC_OrderListErrorCode>("/orders", {
				base: WC_CORE_BASE,
				searchParams: {
					customer: auth.id,
				} satisfies WC_OrderListInput,
			})

			if (response.error) {
				switch (response.error.code) {
					case "woocommerce_rest_cannot_view":
						throw errors.FORBIDDEN({ message: response.error.message })
					default:
						context.logger.error("List orders unhandled error", response.error, { code: response.error.code })
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			const firstOrder = response.data[0]
			if (!firstOrder || firstOrder.customer_id !== auth.id) return emptyList()

			const data = context.service.wordpress.resolveList({ data: response.data, headers: response.headers, searchParams: input.query })

			return { items: data.items.map(deserializeOrder), meta: deserializeListMetadata(data.meta) }
		},
	),
}
