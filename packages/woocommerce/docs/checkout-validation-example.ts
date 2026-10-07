import type { CheckoutValidationData, CheckoutValidationIssue, StorefrontField } from "../src/checkout-validation"

/** Standalone consumers match SDK references against definitions loaded from the active storefront. */
export function matchCheckoutRegisteredFields(
	issue: CheckoutValidationIssue,
	definitions: readonly StorefrontField[],
): readonly string[] | null {
	if (issue.scope !== "unresolved") return null
	const candidates = issue.registeredFields.flatMap(({ id, bucket }) =>
		definitions.flatMap((field) => {
			if (field.id !== id) return []
			if (bucket === "billingAddress" || bucket === "shippingAddress") {
				if (field.location !== "address") return []
				const binding = field.bindings[bucket === "billingAddress" ? "billing" : "shipping"]
				return binding ? [[bucket, ...binding]] : []
			}
			// Unspecified identities never choose between billing and shipping copies.
			if (field.location === "address") return []
			return field.bindings.other ? [field.bindings.other] : []
		}),
	)
	return candidates.length === 1 ? (candidates[0] ?? null) : null
}

/** The caller owns rendering, form projection and error state. */
export function applyCheckoutValidation(
	data: CheckoutValidationData,
	definitions: readonly StorefrontField[],
	handlers: {
		field: (path: readonly string[], message: string) => void
		summary: (message: string) => void
	},
) {
	for (const issue of data.issues) {
		const target = issue.scope === "field" ? issue.target : matchCheckoutRegisteredFields(issue, definitions)
		if (target) handlers.field(target, issue.message)
		else handlers.summary(issue.message)
	}
}
