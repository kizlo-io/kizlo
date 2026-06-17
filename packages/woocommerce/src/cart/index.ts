import { createProcedure, WC_STORE_BASE } from "kizlo"
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
import type {
	WCS_Cart,
	WCS_CartAddItemErrorCode,
	WCS_CartAddItemInput,
	WCS_CartApplyCouponErrorCode,
	WCS_CartGetErrorCode,
	WCS_CartRemoveCouponErrorCode,
	WCS_CartRemoveItemErrorCode,
	WCS_CartSelectShippingRateErrorCode,
	WCS_CartSelectShippingRateInput,
	WCS_CartUpdateCustomerErrorCode,
	WCS_CartUpdateCustomerInput,
	WCS_CartUpdateItemErrorCode,
	WCS_CartUpdateItemInput,
} from "./types.wcs"
import { deserializeCart } from "./utils"

export const CART_ROUTER = {
	get: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/cart",
			output: Cart.nullable(),
			errors: GET_CART_ERROR_MAP,
			middlewares: [sessionMiddleware()],
		},
		async ({ context, errors }) => {
			const response = await context.service.wordpress.get<WCS_Cart, WCS_CartGetErrorCode>("/cart", {
				base: WC_STORE_BASE,
				headers: context.sessionHeaders,
			})

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
			const connInfo = await context.getConnInfo()
			const defaultBilling = input.billing ?? { ...input.shipping, email: undefined }

			const updateData = {
				billing_address:
					defaultBilling !== undefined
						? {
								first_name: defaultBilling?.firstName ?? "",
								last_name: defaultBilling?.lastName ?? "",
								address_1: defaultBilling?.address1 ?? "",
								address_2: defaultBilling?.address2 ?? "",
								company: defaultBilling?.company ?? "",
								email: defaultBilling?.email ?? "",
								phone: defaultBilling?.phone ?? "",
								city: defaultBilling?.city ?? "",
								state: defaultBilling?.state ?? connInfo?.state ?? undefined,
								country: defaultBilling?.country ?? connInfo?.country ?? undefined,
								postcode: defaultBilling?.postcode ?? connInfo?.postcode ?? "",
							}
						: {},
				shipping_address:
					input.shipping !== undefined
						? {
								first_name: input.shipping?.firstName ?? "",
								last_name: input.shipping?.lastName ?? "",
								address_1: input.shipping?.address1 ?? "",
								address_2: input.shipping?.address2 ?? "",
								company: input.shipping?.company ?? "",
								phone: input.shipping?.phone ?? "",
								city: input.shipping?.city ?? "",
								state: input.shipping?.state ?? connInfo?.state ?? undefined,
								country: input.shipping?.country ?? connInfo?.country ?? undefined,
								postcode: input.shipping?.postcode ?? connInfo?.postcode ?? "",
							}
						: {},
			}

			const response = await context.service.wordpress.post<WCS_Cart, WCS_CartUpdateCustomerErrorCode>("/cart/update-customer", {
				base: WC_STORE_BASE,
				body: {
					billing_address: updateData.billing_address,
					shipping_address: updateData.shipping_address,
				} satisfies WCS_CartUpdateCustomerInput,
				headers: context.sessionHeaders,
			})

			if (response.error) {
				switch (response.error.code) {
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
			const response = await context.service.wordpress.post<WCS_Cart, WCS_CartSelectShippingRateErrorCode>("/cart/select-shipping-rate", {
				base: WC_STORE_BASE,
				headers: context.sessionHeaders,
				body: {
					rate_id: body.rateId,
					package_id: body.packageId,
				} satisfies WCS_CartSelectShippingRateInput,
			})

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
				const response = await context.service.wordpress.post<WCS_Cart, WCS_CartAddItemErrorCode>("/cart/add-item", {
					body: {
						id: input.productId,
						quantity: input.quantity,
						variation: input.variations ?? [],
					} satisfies WCS_CartAddItemInput,
					base: WC_STORE_BASE,
					headers: context.sessionHeaders,
				})

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
				const response = await context.service.wordpress.post<WCS_Cart, WCS_CartUpdateItemErrorCode>("/cart/update-item", {
					body: {
						key: params.key,
						quantity: body.quantity,
					} satisfies WCS_CartUpdateItemInput,
					base: WC_STORE_BASE,
					headers: context.sessionHeaders,
				})

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
				method: "PATCH",
				path: "/cart/items/{key}",
				params: RemoveCartItemInput.pick({ key: true }),
				output: Cart,
				errors: REMOVE_CART_ITEM_ERROR_MAP,
				middlewares: [sessionMiddleware()],
			},
			async ({ context, input: { params }, errors }) => {
				const response = await context.service.wordpress.post<WCS_Cart, WCS_CartRemoveItemErrorCode>("/cart/remove-item", {
					body: { key: params.key },
					base: WC_STORE_BASE,
					headers: context.sessionHeaders,
				})

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
				const response = await context.service.wordpress.post<WCS_Cart, WCS_CartApplyCouponErrorCode>("/cart/apply-coupon", {
					body: { code: body.code },
					base: WC_STORE_BASE,
					headers: context.sessionHeaders,
				})

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
				method: "POST",
				path: "/cart/coupons/{code}",
				params: RemoveCouponInput.pick({ code: true }),
				output: Cart,
				errors: REMOVE_COUPON_ERROR_MAP,
				middlewares: [sessionMiddleware()],
			},
			async ({ context, input, errors }) => {
				const response = await context.service.wordpress.post<WCS_Cart, WCS_CartRemoveCouponErrorCode>("/cart/remove-coupon", {
					body: { code: input.params.code },
					base: WC_STORE_BASE,
					headers: context.sessionHeaders,
				})

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
