import type { Bootstrap } from "./bootstrap"

export const data: Bootstrap = {
	version: "0.1.0",
	urls: {
		pos: "https://store.test/shop/pos/",
		wordpress: "https://store.test/shop/",
		account: "https://store.test/shop/wp-admin/profile.php",
		settings: "https://store.test/shop/wp-admin/admin.php?page=wc-settings&tab=kizlo&section=pos",
		login: "https://store.test/shop/wp-login.php?redirect_to=%2Fshop%2Fpos%2F",
		logout: "https://store.test/shop/wp-login.php?action=logout",
	},
	restRoot: "https://store.test/shop/wp-json/",
	nonce: "nonce-from-wordpress",
	user: { id: 12, name: "Store Manager" },
	store: { name: "The General Store", currency: "INR" },
	navigation: [
		{ id: "products", label: "Products" },
		{ id: "sell", label: "Sell" },
		{ id: "orders", label: "Orders" },
		{ id: "settings", label: "Settings" },
	],
}
