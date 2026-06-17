import { createExtension } from "kizlo"
import { CART_ROUTER } from "./cart"
import { CHECKOUT_ROUTER } from "./checkout"
import { CUSTOMER_ROUTER } from "./customer"
import { PRODUCT_ROUTER } from "./product"

export function woocommerce() {
	return createExtension({
		id: "woocommerce",
		init: () => {
			return {
				router: {
					cart: CART_ROUTER,
					products: PRODUCT_ROUTER,
					checkout: CHECKOUT_ROUTER,
					customers: CUSTOMER_ROUTER,
				},
			}
		},
	})
}
