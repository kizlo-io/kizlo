import { createThrowableErrorMap, type KizloError } from "kizlo"
import { expect, test, vi } from "vitest"
import { CONFIRM_CHECKOUT_ERROR_MAP, RETRY_CHECKOUT_ERROR_MAP, UPDATE_CHECKOUT_ERROR_MAP } from "./error"
import { CHECKOUT_PROCEDURES } from "./index"

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
	phone: "0123456789",
	email: "ada@example.com",
	taxId: "GB-42",
	additionalFields: { "qa/reference": "GB-42" },
}

function confirmContext(response: unknown) {
	return {
		wordpress: {
			woocommerce: {
				store: {
					checkout: {
						retrieve: vi.fn(),
						create: vi.fn().mockResolvedValue(response),
					},
				},
			},
		},
		sessionHeaders: { "X-Kizlo-Guest-Token": "guest" },
		logger: { error: vi.fn() },
	}
}

async function confirm(response: unknown, body: Record<string, unknown>) {
	const context = confirmContext(response)
	const promise = CHECKOUT_PROCEDURES.confirm["~kizlo"].handler({
		context: context as never,
		input: { body } as never,
		errors: createThrowableErrorMap(CONFIRM_CHECKOUT_ERROR_MAP),
	})

	return { context, promise }
}

test("confirm submits caller-owned checkout data directly without a hidden read", async () => {
	const { context, promise } = await confirm(
		{
			status: 400,
			data: null,
			error: { code: "rest_invalid_param", message: "Invalid checkout", data: { params: { billing_email: "Required" } } },
		},
		{
			billingAddress,
			paymentMethod: "custom_gateway",
			customerNote: "Call first",
			createAccount: true,
			customerPassword: "secret",
			paymentData: [{ key: "token", value: "tok_42" }],
			additionalFields: { gift_message: "", marketing_opt_in: false },
			extensions: { acme: { source: "test" } },
		},
	)

	await expect(promise).rejects.toMatchObject({
		code: "CHECKOUT_VALIDATION_FAILED",
		data: { issues: [expect.objectContaining({ message: "Required", target: ["billingAddress", "email"] })] },
	})
	expect(context.wordpress.woocommerce.store.checkout.retrieve).not.toHaveBeenCalled()
	expect(context.wordpress.woocommerce.store.checkout.create).toHaveBeenCalledWith(
		{
			body: expect.objectContaining({
				billing_address: expect.objectContaining({ first_name: "Ada", "qa/reference": "GB-42", "kizlo/tax-id": "GB-42" }),
				shipping_address: undefined,
				payment_method: "custom_gateway",
				customer_note: "Call first",
				create_account: true,
				customer_password: "secret",
				additional_fields: { gift_message: "", marketing_opt_in: false },
				extensions: { acme: { source: "test" } },
			}),
		},
		{ headers: context.sessionHeaders },
	)
})

test("createAccount is independent from customerPassword", async () => {
	const { context, promise } = await confirm(
		{
			status: 400,
			data: null,
			error: { code: "registration-error-email-exists", message: "An account already exists", data: null },
		},
		{ billingAddress, paymentMethod: "bacs", createAccount: true },
	)

	await expect(promise).rejects.toEqual(expect.objectContaining<Partial<KizloError>>({ code: "CHECKOUT_ACCOUNT_CREATION_FAILED" }))
	expect(context.wordpress.woocommerce.store.checkout.create).toHaveBeenCalledWith(
		{ body: expect.objectContaining({ create_account: true, customer_password: undefined }) },
		expect.anything(),
	)
})

test("createAccount defaults to false even when a password is provided", async () => {
	const { context, promise } = await confirm(
		{
			status: 500,
			data: null,
			error: { code: "woocommerce_rest_unknown_server_error", message: "Unexpected", data: null },
		},
		{ billingAddress, paymentMethod: "bacs", customerPassword: "secret" },
	)

	await expect(promise).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
	expect(context.wordpress.woocommerce.store.checkout.create).toHaveBeenCalledWith(
		{ body: expect.objectContaining({ create_account: false, customer_password: "secret" }) },
		expect.anything(),
	)
})

test("confirm forwards the per-checkout redirect paths as extensions.kizlo", async () => {
	const { context, promise } = await confirm(
		{ status: 500, data: null, error: { code: "woocommerce_rest_unknown_server_error", message: "Unexpected", data: null } },
		{ billingAddress, paymentMethod: "bacs", successPath: "/thanks", cancelPath: "/cart" },
	)

	await expect(promise).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
	expect(context.wordpress.woocommerce.store.checkout.create).toHaveBeenCalledWith(
		{ body: expect.objectContaining({ extensions: { kizlo: { success_path: "/thanks", cancel_path: "/cart" } } }) },
		expect.anything(),
	)
})

function retryContext(response: unknown) {
	return {
		wordpress: { woocommerce: { store: { checkout: { updateById: vi.fn().mockResolvedValue(response) } } } },
		sessionHeaders: { "X-Kizlo-Guest-Token": "guest" },
		logger: { error: vi.fn() },
	}
}

test("retry forwards the per-checkout redirect paths as extensions.kizlo", async () => {
	const context = retryContext({
		status: 500,
		data: null,
		error: { code: "woocommerce_rest_unknown_server_error", message: "Unexpected", data: null },
	})
	const promise = CHECKOUT_PROCEDURES.retry["~kizlo"].handler({
		context: context as never,
		input: {
			params: { orderId: 42 },
			body: { key: "wc_order_key", paymentMethod: "bacs", billingAddress, successPath: "/thanks", cancelPath: "/cart" },
		} as never,
		errors: createThrowableErrorMap(RETRY_CHECKOUT_ERROR_MAP),
	})

	await expect(promise).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
	expect(context.wordpress.woocommerce.store.checkout.updateById).toHaveBeenCalledWith(
		expect.objectContaining({
			params: { id: "42" },
			body: expect.objectContaining({
				billing_address: expect.objectContaining({ "kizlo/tax-id": "GB-42" }),
				extensions: { kizlo: { success_path: "/thanks", cancel_path: "/cart" } },
			}),
		}),
		expect.anything(),
	)
})

test("retry maps billing Tax ID validation details", async () => {
	const context = retryContext({
		status: 400,
		data: null,
		error: {
			code: "rest_invalid_param",
			message: "Invalid parameter(s): billing_address",
			data: { details: { billing_address: { code: "required", message: "Tax ID is required." } } },
		},
	})
	const promise = CHECKOUT_PROCEDURES.retry["~kizlo"].handler({
		context: context as never,
		input: { params: { orderId: 42 }, body: { key: "key", paymentMethod: "bacs", billingAddress } } as never,
		errors: createThrowableErrorMap(RETRY_CHECKOUT_ERROR_MAP),
	})

	await expect(promise).rejects.toMatchObject({
		code: "CHECKOUT_VALIDATION_FAILED",
		status: 400,
		data: { issues: [expect.objectContaining({ message: "Tax ID is required.", scope: "group", target: ["billingAddress"] })] },
	})
})

test("confirm maps an invalid WooCommerce shipping option", async () => {
	const { context, promise } = await confirm(
		{
			status: 400,
			data: null,
			error: {
				code: "woocommerce_rest_invalid_shipping_option",
				message: "The selected shipping rate is unavailable.",
				data: { status: 400 },
			},
		},
		{ billingAddress, paymentMethod: "bacs" },
	)

	await expect(promise).rejects.toMatchObject({
		code: "CHECKOUT_SHIPPING_OPTION_INVALID",
		status: 400,
		message: "The selected shipping rate is unavailable.",
	})
	expect(context.logger.error).not.toHaveBeenCalled()
})

test.each(["update", "confirm", "retry"] as const)("%s preserves normalized validation evidence", async (operation) => {
	const upstream = {
		code: "rest_invalid_param",
		message: "Invalid checkout",
		data: {
			params: { billing_address: "Required" },
			details: {
				billing_address: {
					code: "woocommerce_required_checkout_field",
					message: "Required",
					data: { param: "billing_address", field: "kizlo/tax-id", group: "billing" },
				},
			},
		},
	}
	const callback = vi.fn().mockResolvedValue({ status: 400, data: null, error: upstream })
	const context = {
		wordpress: { woocommerce: { store: { checkout: { update: callback, create: callback, updateById: callback } } } },
		sessionHeaders: {},
		logger: { error: vi.fn() },
	}
	const errors =
		operation === "update" ? UPDATE_CHECKOUT_ERROR_MAP : operation === "confirm" ? CONFIRM_CHECKOUT_ERROR_MAP : RETRY_CHECKOUT_ERROR_MAP
	const promise = CHECKOUT_PROCEDURES[operation]["~kizlo"].handler({
		context: context as never,
		input: { params: { orderId: 42 }, body: { billingAddress, paymentMethod: "bacs", key: "key" } } as never,
		errors: createThrowableErrorMap(errors) as never,
	})
	await expect(promise).rejects.toMatchObject({
		code: "CHECKOUT_VALIDATION_FAILED",
		message: "Invalid checkout",
		status: 400,
		data: {
			issues: [
				{
					source: "billing_address",
					message: "Required",
					scope: "field",
					target: ["billingAddress", "taxId"],
					sourcePath: ["billing_address", "kizlo/tax-id"],
					code: "woocommerce_required_checkout_field",
				},
			],
		},
	})
	await expect(Promise.resolve(promise).catch((error) => Object.keys(error.data))).resolves.toEqual(["issues"])
	expect(context.logger.error).not.toHaveBeenCalled()
})

test.each(["update", "confirm", "retry"] as const)("%s keeps custom validation messages even without field evidence", async (operation) => {
	const callback = vi.fn().mockResolvedValue({
		status: 400,
		data: null,
		error: { code: "woocommerce_rest_checkout_custom_validation_error", message: "Plugin rejected checkout", data: null },
	})
	const context = {
		wordpress: { woocommerce: { store: { checkout: { update: callback, create: callback, updateById: callback } } } },
		sessionHeaders: {},
		logger: { error: vi.fn() },
	}
	const errors =
		operation === "update" ? UPDATE_CHECKOUT_ERROR_MAP : operation === "confirm" ? CONFIRM_CHECKOUT_ERROR_MAP : RETRY_CHECKOUT_ERROR_MAP
	await expect(
		CHECKOUT_PROCEDURES[operation]["~kizlo"].handler({
			context: context as never,
			input: { params: { orderId: 42 }, body: { billingAddress, paymentMethod: "bacs", key: "key" } } as never,
			errors: createThrowableErrorMap(errors) as never,
		}),
	).rejects.toMatchObject({
		code: "CHECKOUT_VALIDATION_FAILED",
		data: { issues: [{ scope: "unresolved", target: null, message: "Plugin rejected checkout" }] },
	})
})

test.each(["update", "confirm"] as const)("%s retains cart conflict semantics", async (operation) => {
	const callback = vi.fn().mockResolvedValue({
		status: 409,
		data: null,
		error: { code: "woocommerce_rest_cart_empty", message: "Empty cart", data: { cart: null } },
	})
	const context = {
		wordpress: { woocommerce: { store: { checkout: { update: callback, create: callback } } } },
		sessionHeaders: {},
		logger: { error: vi.fn() },
	}
	const errors = operation === "update" ? UPDATE_CHECKOUT_ERROR_MAP : CONFIRM_CHECKOUT_ERROR_MAP
	await expect(
		CHECKOUT_PROCEDURES[operation]["~kizlo"].handler({
			context: context as never,
			input: { body: { billingAddress, paymentMethod: "bacs" } } as never,
			errors: createThrowableErrorMap(errors) as never,
		}),
	).rejects.toMatchObject({ code: "CHECKOUT_CART_EMPTY", status: 409, data: { cart: null } })
})

test.each(["confirm", "retry"] as const)("%s retains payment failure semantics", async (operation) => {
	const callback = vi.fn().mockResolvedValue({
		status: 400,
		data: null,
		error: { code: "woocommerce_rest_checkout_process_payment_error", message: "Payment declined", data: null },
	})
	const context = {
		wordpress: { woocommerce: { store: { checkout: { create: callback, updateById: callback } } } },
		sessionHeaders: {},
		logger: { error: vi.fn() },
	}
	const errors = operation === "confirm" ? CONFIRM_CHECKOUT_ERROR_MAP : RETRY_CHECKOUT_ERROR_MAP
	await expect(
		CHECKOUT_PROCEDURES[operation]["~kizlo"].handler({
			context: context as never,
			input: { params: { orderId: 42 }, body: { billingAddress, paymentMethod: "bacs", key: "key" } } as never,
			errors: createThrowableErrorMap(errors) as never,
		}),
	).rejects.toMatchObject({ code: "CHECKOUT_PAYMENT_FAILED", message: "Payment declined" })
})
