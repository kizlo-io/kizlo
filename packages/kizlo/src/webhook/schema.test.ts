import { expect, test } from "vitest"
import { KizloEvent } from "./schema"

test("the WooCommerce settings event parses as a settings event with no data", () => {
	expect(KizloEvent.parse({ type: "settings.woocommerce.updated", data: null })).toEqual({
		type: "settings.woocommerce.updated",
		data: null,
	})
})

test("dependency maps preserve legacy unknowns and reject invalid identities", () => {
	for (const affected_terms of [undefined, null, {}, { category: [1, 2, 1] }]) {
		const event = KizloEvent.parse({ type: "post.updated", data: { post_id: 1, post_type: "product", affected_terms } })
		expect(event.type).toBe("post.updated")
	}
	for (const affected_terms of [
		[],
		{ category: [0] },
		{ category: [-1] },
		{ category: [1.1] },
		{ category: [Number.MAX_SAFE_INTEGER + 1] },
	]) {
		expect(KizloEvent.safeParse({ type: "post.updated", data: { post_id: 1, post_type: "product", affected_terms } }).success).toBe(false)
	}
	expect(KizloEvent.parse({ type: "settings.headless.updated", data: null }).type).toBe("settings.headless.updated")
})
