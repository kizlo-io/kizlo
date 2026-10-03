import { timestampFromWpGmt, toPublicMetadata } from "@kizlo/shared"
import { type AddressAdditionalFields, additionalFieldValues, type ContactAdditionalFields } from "../additional-fields"
import type { Customer } from "./schema"
import type { WCK_Customer } from "./types"

export function deserializeCustomer(data: WCK_Customer): Customer {
	const billing = data.billing

	return {
		id: data.id,
		avatarUrl: data.avatar_url.length ? data.avatar_url : null,
		billing: {
			firstName: billing.first_name,
			lastName: billing.last_name,
			address1: billing.address_1,
			city: billing.city,
			country: billing.country,
			email: billing.email,
			phone: billing.phone,
			postcode: billing.postcode,
			state: billing.state,
			address2: billing.address_2,
			company: billing.company,
			taxId: typeof billing.tax_id === "string" ? billing.tax_id : "",
			additionalFields: additionalFieldValues<AddressAdditionalFields>(billing.additional_fields),
		},
		shipping: {
			additionalFields: additionalFieldValues<AddressAdditionalFields>(data.shipping.additional_fields),
			firstName: data.shipping.first_name,
			lastName: data.shipping.last_name,
			address1: data.shipping.address_1,
			city: data.shipping.city,
			country: data.shipping.country,
			phone: data.shipping.phone,
			postcode: data.shipping.postcode,
			state: data.shipping.state,
			address2: data.shipping.address_2,
			company: data.shipping.company,
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
