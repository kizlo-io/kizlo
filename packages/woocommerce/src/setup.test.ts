import { Kizlo } from "kizlo"
import { expect, test } from "vitest"
import { woocommerce } from "./index"

/**
 * The integration ships in two halves that update separately, and npm cannot see the WordPress one.
 * An installation without the companion plugin describes none of the routes these procedures call,
 * so the server refuses to start rather than letting the first checkout fail somewhere inside a
 * procedure.
 */
function server(endpoints: object) {
	return () =>
		new Kizlo({
			baseUrl: "https://app.example",
			siteSecret: "site-secret",
			credentials: { url: "https://wp.example", username: "admin", password: "secret" },
			integrations: [woocommerce()],
			wordpressEndpoints: endpoints,
		})
}

test("refuses to start against a WordPress that does not serve the integration routes", () => {
	expect(server({})).toThrow(/woocommerce\.store\.cart/)
	expect(server({})).toThrow(/kizlo-woocommerce 0\.2\.0\+/)
})

test("names only the subtrees that are missing", () => {
	const partial = {
		woocommerce: {
			customers: {},
			products: {},
			kizlo: { cart: {} },
			store: { cart: {}, products: {} },
		},
	}

	// A plugin old enough to predate the checkout routes reaches here as a tree missing one subtree.
	expect(server(partial)).toThrow(/woocommerce\.store\.checkout/)
	expect(server(partial)).not.toThrow(/woocommerce\.store\.cart,/)
})
