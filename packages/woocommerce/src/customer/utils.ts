import { toPublicMetadata } from "@kizlo/shared"
import type { Customer } from "./schema"
import type { WC_Customer } from "./types.wc"

export function deserializeCustomer(data: WC_Customer): Customer {
	return {
		id: data.id,
		avatarUrl: data.avatar_url.length ? data.avatar_url : null,
		billing: {
			firstName: data.billing.first_name,
			lastName: data.billing.last_name,
			address1: data.billing.address_1,
			city: data.billing.city,
			country: data.billing.country,
			email: data.billing.email,
			phone: data.billing.phone,
			postcode: data.billing.postcode,
			state: data.billing.state,
			address2: data.billing.address_2,
			company: data.billing.company,
		},
		shipping: {
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
		email: data.email,
		firstName: data.first_name,
		lastName: data.last_name,
		isPayingCustomer: data.is_paying_customer,
		meta: toPublicMetadata(data.meta_data),
		registeredAt: new Date(data.date_created).getTime(),
		role: data.role,
		username: data.username,
	}
}
