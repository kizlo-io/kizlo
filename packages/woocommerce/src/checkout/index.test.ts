import { createThrowableErrorMap, type KizloError } from "kizlo"
import { expect, test, vi } from "vitest"
import { CONFIRM_CHECKOUT_ERROR_MAP } from "./error"
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
	additionalFields: { tax_id: "GB-42" },
}

function confirmContext(response: unknown) {
	return {
		wordpress: {
			woocommerce: {
				store: {
					checkout: {
						get: vi.fn(),
						process: vi.fn().mockResolvedValue(response),
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
		data: { fields: { billing_email: "Required" } },
	})
	expect(context.wordpress.woocommerce.store.checkout.get).not.toHaveBeenCalled()
	expect(context.wordpress.woocommerce.store.checkout.process).toHaveBeenCalledWith(
		expect.objectContaining({
			billing_address: expect.objectContaining({ first_name: "Ada", tax_id: "GB-42" }),
			shipping_address: undefined,
			payment_method: "custom_gateway",
			customer_note: "Call first",
			create_account: true,
			customer_password: "secret",
			additional_fields: { gift_message: "", marketing_opt_in: false },
			extensions: { acme: { source: "test" } },
		}),
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
	expect(context.wordpress.woocommerce.store.checkout.process).toHaveBeenCalledWith(
		expect.objectContaining({ create_account: true, customer_password: undefined }),
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
	expect(context.wordpress.woocommerce.store.checkout.process).toHaveBeenCalledWith(
		expect.objectContaining({ create_account: false, customer_password: "secret" }),
		expect.anything(),
	)
})
