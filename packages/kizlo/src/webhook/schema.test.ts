import { expect, test } from "vitest"
import { KizloEvent } from "./schema"

test("the WooCommerce settings event parses as a settings event with no data", () => {
	expect(KizloEvent.parse({ type: "settings.woocommerce.updated", data: null })).toEqual({
		type: "settings.woocommerce.updated",
		data: null,
	})
})
