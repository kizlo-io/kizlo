import { type AuthGetSession, createIntegration, Kizlo } from "kizlo"
import { afterEach, expect, test, vi } from "vitest"
import { introspection } from "../../../../introspection"
import { type WooCommerceOptions, woocommerce } from "../index"
import { serializeCheckoutBillingAddress, serializeCheckoutShippingAddress } from "./utils"

const EMAIL = "shopper@example.com"
const billingAddress = {
	firstName: "Ada",
	lastName: "Lovelace",
	company: "",
	address1: "1 Store Street",
	address2: "",
	city: "London",
	state: "",
	postcode: "SW1A 1AA",
	country: "GB",
	phone: "",
	email: EMAIL,
	taxId: "",
	additionalFields: { "qa/reference": "" },
}
const confirmBody = { billingAddress, paymentMethod: "bacs" }
const retryBody = { ...confirmBody, key: "order-key", billingEmail: EMAIL }
const operations = [
	["get", "GET", "/checkout", undefined],
	["update", "PUT", "/checkout", {}],
	["confirm", "POST", "/checkout", confirmBody],
	["retry", "POST", "/checkout/1", retryBody],
] as const

function instance(options?: WooCommerceOptions, resolve: AuthGetSession = () => null) {
	const getSession = vi.fn(resolve)
	const cookies = { getAll: vi.fn<() => { name: string; value: string }[]>(() => []), setAll: vi.fn(), deleteAll: vi.fn() }
	const downstream = vi.fn<typeof fetch>(async () =>
		Response.json(
			{
				order_id: 1,
				order_number: "1",
				order_key: "order-key",
				status: "pending",
				customer_id: 1,
				customer_note: "",
				billing_address: serializeCheckoutBillingAddress(billingAddress),
				shipping_address: serializeCheckoutShippingAddress(billingAddress),
				payment_method: "bacs",
				payment_result: null,
				additional_fields: {},
				extensions: {},
			},
			{ headers: { "x-kizlo-version": "999.0.0", "x-kizlo-extensions": "kizlo-woocommerce=999.0.0" } },
		),
	)
	vi.stubGlobal("fetch", downstream)
	const api = new Kizlo({
		baseUrl: "https://app.example/api/kizlo",
		siteSecret: "test-secret",
		credentials: { url: "https://wp.example", username: "admin", password: "secret" },
		introspection,
		integrations: [createIntegration({ id: "auth", adapters: { auth: { getSession }, cookies } }), woocommerce(options)],
	})
	return { api, getSession, cookies, downstream }
}

afterEach(() => vi.unstubAllGlobals())

function invoke(api: ReturnType<typeof instance>["api"], operation: (typeof operations)[number][0]) {
	const checkout = api.client.woocommerce.checkout
	switch (operation) {
		case "get":
			return checkout.get.call()
		case "update":
			return checkout.update.call({ body: {} })
		case "confirm":
			return checkout.confirm.call({ body: confirmBody })
		case "retry":
			return checkout.retry.call({ params: { orderId: 1 }, body: retryBody })
	}
}

function request(method: string, path: string, body: unknown, cookie?: string) {
	return new Request(`https://app.example/api/kizlo${path}`, {
		method,
		headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
		body: body === undefined ? undefined : JSON.stringify(body),
	})
}

test.each(operations)("%s rejects anonymous HTTP and server checkout without effects", async (operation, method, path, body) => {
	const { api, downstream, getSession, cookies } = instance({ allowGuest: false })

	await expect(invoke(api, operation)).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 })
	expect(getSession).toHaveBeenCalledOnce()
	getSession.mockClear()

	const response = await api.handler(request(method, path, body, "guest-session=guest-cookie"))
	expect(response.status).toBe(401)
	expect(await response.json()).toMatchObject({ code: "UNAUTHORIZED" })
	expect(response.headers.getSetCookie()).toEqual([])
	expect(getSession).toHaveBeenCalledOnce()
	expect(downstream).not.toHaveBeenCalled()
	expect(cookies.setAll).not.toHaveBeenCalled()
	expect(cookies.deleteAll).not.toHaveBeenCalled()
})

test.each(operations)(
	"%s forwards adapter identity once for HTTP and cookie-derived server checkout",
	async (operation, method, path, body) => {
		const { api, downstream, getSession, cookies } = instance({ allowGuest: false }, (incoming) =>
			incoming?.headers.get("cookie") === "session=owner" ? { id: "owner", email: EMAIL } : null,
		)
		cookies.getAll.mockReturnValue([{ name: "session", value: "owner" }])

		await expect(invoke(api, operation)).resolves.toMatchObject({ orderId: 1 })
		expect(getSession).toHaveBeenCalledOnce()
		expect(new Headers(downstream.mock.calls[0]?.[1]?.headers).get("X-Kizlo-User-Email")).toBe(EMAIL)
		getSession.mockClear()
		downstream.mockClear()

		const response = await api.handler(request(method, path, body, "session=owner"))
		expect(response.status).toBe(200)
		expect(getSession).toHaveBeenCalledOnce()
		expect(new Headers(downstream.mock.calls[0]?.[1]?.headers).get("X-Kizlo-User-Email")).toBe(EMAIL)
	},
)

test.each([undefined, true, false])("customers.get always requires login (allowGuest=%s)", async (allowGuest) => {
	const { api, downstream } = instance(allowGuest === undefined ? undefined : { allowGuest })
	await expect(api.client.woocommerce.customers.get.call()).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 })
	expect((await api.handler(request("GET", "/customers", undefined))).status).toBe(403)
	expect(downstream).not.toHaveBeenCalled()
})

test("integration instances preserve omitted/true guest checkout independently of protected checkout", async () => {
	const protectedApi = instance({ allowGuest: false })
	for (const options of [undefined, { allowGuest: true }]) {
		const { api, downstream } = instance(options)
		const response = await api.handler(request("GET", "/checkout", undefined))
		expect(response.status).toBe(200)
		expect(response.headers.getSetCookie()[0]).toMatch(/^guest-session=/)
		expect(downstream).toHaveBeenCalledOnce()
		await expect(protectedApi.api.client.woocommerce.checkout.get.call()).rejects.toMatchObject({ code: "UNAUTHORIZED" })
	}
})

test("adapter failure never falls back to guest checkout", async () => {
	const failure = new Error("Auth unavailable")
	const { api, downstream, cookies } = instance({ allowGuest: false }, () => {
		throw failure
	})
	await expect(api.client.woocommerce.checkout.get.call()).rejects.toMatchObject({
		code: "INTERNAL_SERVER_ERROR",
		message: failure.message,
	})
	const response = await api.handler(request("GET", "/checkout", undefined))
	expect(response.status).toBe(500)
	expect(response.headers.getSetCookie()).toEqual([])
	expect(cookies.setAll).not.toHaveBeenCalled()
	expect(downstream).not.toHaveBeenCalled()
})

test.each([undefined, true])("omitted/true options allow all guest checkout operations (allowGuest=%s)", async (allowGuest) => {
	const { api, downstream } = instance(allowGuest === undefined ? undefined : { allowGuest })
	for (const [operation, method, path, body] of operations) {
		await expect(invoke(api, operation)).resolves.toMatchObject({ orderId: 1 })
		const response = await api.handler(request(method, path, body))
		expect(response.status).toBe(200)
		expect(response.headers.getSetCookie()[0]).toMatch(/^guest-session=/)
	}
	expect(downstream).toHaveBeenCalledTimes(8)
})

test("allowGuest does not override WooCommerce disabling guest checkout", async () => {
	const { api, downstream } = instance({ allowGuest: true })
	downstream.mockImplementation(async () =>
		Response.json(
			{ code: "woocommerce_rest_guest_checkout_disabled", message: "Guest checkout disabled", data: { status: 403 } },
			{ status: 403, headers: { "x-kizlo-version": "999.0.0", "x-kizlo-extensions": "kizlo-woocommerce=999.0.0" } },
		),
	)
	await expect(api.client.woocommerce.checkout.confirm.call({ body: confirmBody })).rejects.toMatchObject({
		code: "CHECKOUT_GUEST_DISABLED",
	})
})
