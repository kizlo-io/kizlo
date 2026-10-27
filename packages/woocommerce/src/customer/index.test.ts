import { createThrowableErrorMap } from "kizlo"
import { expect, test, vi } from "vitest"
import { CUSTOMER_PROCEDURES } from "./index"
import type { WCK_Customer } from "./types"
import { deserializeCustomer } from "./utils"

function invoke(response: unknown, session: { email: string } | null = { email: "ada@example.com" }) {
	const retrieve = vi.fn().mockResolvedValue(response)
	const context = {
		getSession: vi.fn().mockResolvedValue(session),
		wordpress: { woocommerce: { kizlo: { customers: { retrieve } } } },
		logger: { error: vi.fn() },
	}
	const procedure = CUSTOMER_PROCEDURES.get["~kizlo"]
	const promise = procedure.handler({
		context: context as never,
		input: undefined as never,
		errors: createThrowableErrorMap(procedure.options.errors ?? {}),
	})
	return { promise, retrieve, context }
}

test("requires a session before making any backend request", async () => {
	const { promise, retrieve } = invoke(null, null)
	await expect(promise).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 })
	expect(retrieve).not.toHaveBeenCalled()
})

test("reads the customer API with session identity and preserves normalization", async () => {
	const address = {
		first_name: "Ada",
		last_name: "",
		company: "",
		address_1: "",
		address_2: "",
		city: "",
		state: "",
		postcode: "",
		country: "",
		phone: "",
		additional_fields: {},
	}
	const customer = {
		id: 42,
		email: "ada@example.com",
		avatar_url: "",
		first_name: "Ada",
		last_name: "",
		username: "ada",
		role: "customer",
		is_paying_customer: false,
		date_created_gmt: "2026-10-27T00:00:00",
		date_created: "2026-10-27T00:00:00",
		date_modified: "2026-10-27T00:00:00",
		date_modified_gmt: "2026-10-27T00:00:00",
		meta_data: [],
		additional_fields: {},
		billing: { ...address, email: "ada@example.com" },
		shipping: address,
	} as WCK_Customer
	const { promise, retrieve } = invoke({ data: customer, error: null })
	await expect(promise).resolves.toEqual(deserializeCustomer(customer))
	expect(retrieve).toHaveBeenCalledExactlyOnceWith(undefined, { headers: { "X-Kizlo-User-Email": "ada@example.com" } })
})

test.each([
	["kizlo_invalid_identity", "UNAUTHORIZED", 401],
	["kizlo_forbidden_identity", "FORBIDDEN", 403],
	["kizlo_customer_unavailable", "SERVICE_UNAVAILABLE", 503],
])("maps %s without losing its message", async (backendCode, code, status) => {
	const { promise, context } = invoke({ error: { code: backendCode, message: "Retry or correct identity" } })
	await expect(promise).rejects.toMatchObject({ code, status, message: "Retry or correct identity" })
	expect(context.logger.error).not.toHaveBeenCalled()
})

test.each(["kizlo_rest_unauthorized", "kizlo_rest_forbidden", "unexpected_backend_error"])("logs %s as a backend failure", async (code) => {
	const { promise, context, retrieve } = invoke({ error: { code, message: "Backend failure" } })
	await expect(promise).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", status: 500 })
	expect(context.logger.error).toHaveBeenCalledOnce()
	expect(retrieve).toHaveBeenCalledOnce()
})
