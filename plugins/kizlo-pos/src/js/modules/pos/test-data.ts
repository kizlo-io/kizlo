import type { Bootstrap } from "./bootstrap"
import type { CheckoutConfig } from "./checkout-api"

export const data: Bootstrap = {
	version: "0.1.0",
	security: { configured: true, locked: false, idle_minutes: 15, has_passkey: false, passkey_available: false },
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
}

export const checkout: CheckoutConfig = {
	fields: { first_name: false, last_name: false, email: false, phone: false, billing: false, shipping: false },
	handoff: { device: true, send: true, default: "device" },
	store_address: { country: "US" },
	countries: { US: "United States" },
	states: { US: { CA: "California" } },
	address_fields: { billing: {}, shipping: {} },
	channels: [{ id: "email", label: "Email" }],
	currency: "USD",
}
