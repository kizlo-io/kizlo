import { timestampFromWpGmt, toPublicMetadata } from "@kizlo/shared"
import {
	additionalFieldValues,
	billingAdditionalFieldValues,
	type ContactAdditionalFields,
	shippingAdditionalFieldValues,
} from "../additional-fields"
import { deserializeCoreAddress } from "../checkout-fields"
import { deserializeBillingFields } from "../field-projections"
import type { Customer } from "./schema"
import type { WCK_Customer } from "./types"

export function deserializeCustomer(data: WCK_Customer): Customer {
	const billing = data.billing

	return {
		id: data.id,
		avatarUrl: data.avatar_url.length ? data.avatar_url : null,
		billing: {
			...deserializeCoreAddress(billing),
			email: billing.email,
			...deserializeBillingFields(additionalFieldValues(billing.additional_fields)),
			additionalFields: billingAdditionalFieldValues(billing.additional_fields),
		},
		shipping: {
			additionalFields: shippingAdditionalFieldValues(data.shipping.additional_fields),
			...deserializeCoreAddress(data.shipping),
		},
		additionalFields: additionalFieldValues<ContactAdditionalFields>(data.additional_fields),
		email: data.email,
		firstName: data.first_name,
		lastName: data.last_name,
		isPayingCustomer: data.is_paying_customer,
		meta: toPublicMetadata(data.meta_data),
		registeredAt: timestampFromWpGmt(data.date_created_gmt) ?? 0,
		role: data.role,
		username: data.username,
	}
}
