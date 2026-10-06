import { type CheckoutValidationData, resolveCheckoutValidationIssues, type StorefrontField } from "../src/checkout-validation"

/** Caller-owned handlers consume SDK paths; application projection and state belong to the caller. */
export function applyCheckoutValidation(
	data: CheckoutValidationData,
	definitions: readonly StorefrontField[],
	handlers: {
		field: (path: readonly string[], message: string) => void
		summary: (message: string) => void
	},
) {
	for (const issue of resolveCheckoutValidationIssues(data, definitions)) {
		if (issue.scope === "field") handlers.field(issue.target, issue.message)
		else handlers.summary(issue.message)
	}
}
