import { createIntegration } from "kizlo"
import { CART_PROCEDURES } from "./cart"
import { CHECKOUT_PROCEDURES } from "./checkout"
import { CUSTOMER_PROCEDURES } from "./customer"
import { PRODUCT_PROCEDURES } from "./product"

export * from "./cart/schema"
export * from "./product/schema"

export function woocommerce() {
	return createIntegration({
		id: "woocommerce",
		requires: {
			plugins: [{ name: "kizlo-woocommerce", version: "0.4.0" }],
			// The `wc/v3` and `wc/store/v1` operations this integration calls. WooCommerce serves them, but
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
		procedures: {
			cart: CART_PROCEDURES,
			products: PRODUCT_PROCEDURES,
			checkout: CHECKOUT_PROCEDURES,
			customers: CUSTOMER_PROCEDURES,
		},
	})
}
