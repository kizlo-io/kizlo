import { createExtension } from "kizlo"
import { CART_ROUTER } from "./cart"
import { CHECKOUT_ROUTER } from "./checkout"
import { CUSTOMER_ROUTER } from "./customer"
import { PRODUCT_ROUTER } from "./product"

export function woocommerce() {
	return createExtension({
		id: "woocommerce",
		requires: {
			plugin: { slug: "kizlo-woocommerce", name: "Kizlo WooCommerce", version: "0.2.0" },
			// The `wc/v3` and `wc/store/v1` operations this extension calls. WooCommerce serves them, but
			// only the Kizlo WooCommerce plugin describes them, so an absent subtree means that plugin is
			// missing or predates the contract rather than anything being wrong with WooCommerce.
			endpoints: [
				"woocommerce.customers",
				"woocommerce.products",
				"woocommerce.kizlo.cart",
				"woocommerce.store.cart",
				"woocommerce.store.checkout",
				"woocommerce.store.products",
			],
		},
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
