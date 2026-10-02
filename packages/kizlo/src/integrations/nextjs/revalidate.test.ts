import { expect, test, vi } from "vitest"
import type { ProcedureContext } from "../../context"
import { nextRevalidation } from "./revalidate"

test("a WooCommerce settings change revalidates the whole layout", async () => {
	const revalidatePath = vi.fn()
	const revalidateTag = vi.fn()
	const [handler] = nextRevalidation({ revalidatePath, revalidateTag, sitemap: false }).events ?? []

	await handler?.handler({ type: "settings.woocommerce.updated", data: null }, {} as ProcedureContext)

	expect(revalidatePath).toHaveBeenCalledWith("/", "layout")
})
