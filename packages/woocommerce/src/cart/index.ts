import { createProcedure } from "kizlo"
import { sessionMiddleware } from "../session"
import {
	ADD_CART_ITEM_ERROR_MAP,
	APPLY_COUPON_ERROR_MAP,
	GET_CART_ERROR_MAP,
	REMOVE_CART_ITEM_ERROR_MAP,
	REMOVE_COUPON_ERROR_MAP,
	SELECT_SHIPPING_RATE_ERROR_MAP,
	UPDATE_CART_ERROR_MAP,
	UPDATE_CART_ITEM_ERROR_MAP,
} from "./error"
import {
	AddCartItemInput,
	ApplyCouponInput,
	Cart,
	RemoveCartItemInput,
	RemoveCouponInput,
	SelectCartShippingRateInput,
	UpdateCartInput,
	UpdateCartItemInput,
} from "./schema"
import { deserializeCart, serializeCartUpdateInput } from "./utils"

export const CART_PROCEDURES = {
	get: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/cart",
			output: Cart,
			errors: GET_CART_ERROR_MAP,
			middlewares: [sessionMiddleware()],
		},
		async ({ context, errors }) => {
			const response = await context.wordpress.woocommerce.store.cart.get({}, { headers: context.sessionHeaders })

			if (response.error) {
				switch (response.error.code) {
					default:
						context.logger.error("Get cart unhandled error", response.error, { code: response.error.code })
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			return deserializeCart(response.data)
		},
	),

	update: createProcedure(
		{
			scope: "api",
			method: "PUT",
			path: "/cart",
			output: Cart,
			body: UpdateCartInput,
			errors: UPDATE_CART_ERROR_MAP,
			middlewares: [sessionMiddleware()],
		},
		async ({ context, input: { body: input }, errors }) => {
			const response = await context.wordpress.woocommerce.store.cart.updateCustomer(serializeCartUpdateInput(input), {
				headers: context.sessionHeaders,
			})

			if (response.error) {
				switch (response.error.code) {
					case "rest_invalid_param":
					case "woocommerce_rest_invalid_address":
					case "woocommerce_rest_invalid_address_country":
					case "woocommerce_rest_invalid_email_address":
					case "woocommerce_rest_missing_email_address":
						throw errors.CART_ADDRESS_INVALID({ message: response.error.message })
					default:
						context.logger.error("Update cart customer unhandled error", response.error, { code: response.error.code })
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			return deserializeCart(response.data)
		},
	),

	selectShippingRate: createProcedure(
		{
			scope: "api",
			method: "PUT",
			path: "/cart/shipping-rate",
			body: SelectCartShippingRateInput,
			output: Cart,
			errors: SELECT_SHIPPING_RATE_ERROR_MAP,
			middlewares: [sessionMiddleware()],
		},
		async ({ context, input: { body }, errors }) => {
			const response = await context.wordpress.woocommerce.store.cart.selectShippingRate(
				{ rate_id: body.rateId, package_id: body.packageId },
				{ headers: context.sessionHeaders },
			)

			if (response.error) {
				switch (response.error.code) {
					case "woocommerce_rest_cart_shipping_rate_not_found":
						throw errors.CART_SHIPPING_RATE_NOT_FOUND({ message: response.error.message })
					case "woocommerce_rest_shipping_disabled":
						throw errors.CART_SHIPPING_DISABLED({ message: response.error.message })
					default:
						context.logger.error("Select shipping rate unhandled error", response.error, { code: response.error.code })
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			return deserializeCart(response.data)
		},
	),

	items: {
		add: createProcedure(
			{
				scope: "api",
				method: "POST",
				path: "/cart/items",
				body: AddCartItemInput,
				output: Cart,
				errors: ADD_CART_ITEM_ERROR_MAP,
				middlewares: [sessionMiddleware()],
			},
			async ({ context, input: { body: input }, errors }) => {
				const response = await context.wordpress.woocommerce.store.cart.addItem(
					{
						id: input.variationId ?? input.productId,
						quantity: input.quantity,
						variation: input.selectedAttributes ?? [],
					},
					{ headers: context.sessionHeaders },
				)

				if (response.error) {
					switch (response.error.code) {
						case "woocommerce_rest_product_out_of_stock":
							throw errors.CART_ITEM_OUT_OF_STOCK({ message: response.error.message })
						case "woocommerce_rest_product_partially_out_of_stock":
							throw errors.CART_ITEM_INSUFFICIENT_STOCK({ message: response.error.message })
						case "woocommerce_rest_product_not_purchasable":
							throw errors.CART_ITEM_NOT_PURCHASABLE({ message: response.error.message })
						case "woocommerce_rest_product_invalid_quantity":
							throw errors.CART_ITEM_INVALID_QUANTITY({ message: response.error.message })
						case "woocommerce_rest_cart_item_exists":
							throw errors.CART_ITEM_EXISTS({ message: response.error.message })
						case "woocommerce_rest_cart_invalid_product":
						case "woocommerce_rest_cart_invalid_parent_product":
							throw errors.CART_PRODUCT_INVALID({ message: response.error.message })
						case "woocommerce_rest_invalid_variation_data":
						case "woocommerce_rest_missing_attributes":
						case "woocommerce_rest_missing_variation_data":
						case "woocommerce_rest_variation_id_from_variation_data":
							throw errors.CART_VARIATION_INVALID({ message: response.error.message })
						default:
							context.logger.error("Add cart item unhandled error", response.error, { code: response.error.code })
							throw errors.INTERNAL_SERVER_ERROR()
					}
				}

				return deserializeCart(response.data)
			},
		),

		update: createProcedure(
			{
				scope: "api",
				method: "PUT",
				path: "/cart/items/{key}",
				params: UpdateCartItemInput.pick({ key: true }),
				body: UpdateCartItemInput.pick({ quantity: true }),
				output: Cart,
				errors: UPDATE_CART_ITEM_ERROR_MAP,
				middlewares: [sessionMiddleware()],
			},
			async ({ context, input: { params, body }, errors }) => {
				const response = await context.wordpress.woocommerce.store.cart.updateItem(
					{ key: params.key, quantity: body.quantity },
					{ headers: context.sessionHeaders },
				)

				if (response.error) {
					switch (response.error.code) {
						case "woocommerce_rest_cart_invalid_key":
							throw errors.CART_ITEM_NOT_FOUND({ message: response.error.message })
						case "woocommerce_rest_cart_invalid_product":
							throw errors.CART_PRODUCT_INVALID({ message: response.error.message })
						case "woocommerce_rest_product_out_of_stock":
							throw errors.CART_ITEM_OUT_OF_STOCK({ message: response.error.message })
						case "woocommerce_rest_product_partially_out_of_stock":
							throw errors.CART_ITEM_INSUFFICIENT_STOCK({ message: response.error.message })
						case "woocommerce_rest_product_invalid_quantity":
							throw errors.CART_ITEM_INVALID_QUANTITY({ message: response.error.message })
						default:
							context.logger.error("Update cart item unhandled error", response.error, { code: response.error.code })
							throw errors.INTERNAL_SERVER_ERROR()
					}
				}

				return deserializeCart(response.data)
			},
		),

		remove: createProcedure(
			{
				scope: "api",
				method: "DELETE",
				path: "/cart/items/{key}",
				params: RemoveCartItemInput.pick({ key: true }),
				output: Cart,
				errors: REMOVE_CART_ITEM_ERROR_MAP,
				middlewares: [sessionMiddleware()],
			},
			async ({ context, input: { params }, errors }) => {
				const response = await context.wordpress.woocommerce.store.cart.removeItem({ key: params.key }, { headers: context.sessionHeaders })

				if (response.error) {
					switch (response.error.code) {
						case "woocommerce_rest_cart_invalid_key":
							throw errors.CART_ITEM_NOT_FOUND({ message: response.error.message })
						default:
							context.logger.error("Remove cart item unhandled error", response.error, { code: response.error.code })
							throw errors.INTERNAL_SERVER_ERROR()
					}
				}

				return deserializeCart(response.data)
			},
		),
	},

	coupons: {
		apply: createProcedure(
			{
				scope: "api",
				method: "POST",
				path: "/cart/coupons",
				body: ApplyCouponInput,
				output: Cart,
				errors: APPLY_COUPON_ERROR_MAP,
				middlewares: [sessionMiddleware()],
			},
			async ({ context, input: { body }, errors }) => {
				const response = await context.wordpress.woocommerce.store.cart.applyCoupon(
					{ code: body.code },
					{ headers: context.sessionHeaders },
				)

				if (response.error) {
					switch (response.error.code) {
						case "woocommerce_rest_cart_coupon_error":
							throw errors.CART_COUPON_INVALID({ message: response.error.message })
						case "woocommerce_rest_cart_coupon_disabled":
							throw errors.CART_COUPON_DISABLED({ message: response.error.message })
						default:
							context.logger.error("Apply coupon unhandled error", response.error, { code: response.error.code })
							throw errors.INTERNAL_SERVER_ERROR()
					}
				}

				return deserializeCart(response.data)
			},
		),

		remove: createProcedure(
			{
				scope: "api",
				method: "DELETE",
				path: "/cart/coupons/{code}",
				params: RemoveCouponInput.pick({ code: true }),
				output: Cart,
				errors: REMOVE_COUPON_ERROR_MAP,
				middlewares: [sessionMiddleware()],
			},
			async ({ context, input, errors }) => {
				const response = await context.wordpress.woocommerce.store.cart.removeCoupon(
					{ code: input.params.code },
					{ headers: context.sessionHeaders },
				)

				if (response.error) {
					switch (response.error.code) {
						case "woocommerce_rest_cart_coupon_error":
							throw errors.CART_COUPON_INVALID({ message: response.error.message })
						case "woocommerce_rest_cart_coupon_disabled":
							throw errors.CART_COUPON_DISABLED({ message: response.error.message })
						case "woocommerce_rest_cart_coupon_invalid_code":
							throw errors.CART_COUPON_NOT_FOUND({ message: response.error.message })
						default:
							context.logger.error("Remove coupon unhandled error", response.error, { code: response.error.code })
							throw errors.INTERNAL_SERVER_ERROR()
					}
				}

				return deserializeCart(response.data)
			},
		),
	},
}
