import { deserializeCart } from "../cart/utils"
import type { Checkout } from "./schema"
import type { WCS_Checkout } from "./types.wcs"

export function deserializeCheckout(data: WCS_Checkout): Checkout {
	return {
		cart: data.__experimentalCart ? deserializeCart(data.__experimentalCart) : null,
		shippingAddress: {
			address1: data.shipping_address.address_1,
			address2: data.shipping_address.address_2,
			city: data.shipping_address.city,
			company: data.shipping_address.company,
			country: data.shipping_address.country,
			firstName: data.shipping_address.first_name,
			lastName: data.shipping_address.last_name,
			phone: data.shipping_address.phone,
			postcode: data.shipping_address.postcode,
			state: data.shipping_address.state,
		},
		billingAddress: {
			address1: data.billing_address.address_1,
			address2: data.billing_address.address_2,
			city: data.billing_address.city,
			company: data.billing_address.company,
			country: data.billing_address.country,
			email: data.billing_address.email,
			firstName: data.billing_address.first_name,
			lastName: data.billing_address.last_name,
			phone: data.billing_address.phone,
			postcode: data.billing_address.postcode,
			state: data.billing_address.state,
		},
		additionalFields: data.additional_fields,
		customerNote: data.customer_note,
		paymentMethod: data.payment_method,
		paymentResult: data.payment_result?.payment_status
			? {
					status: data.payment_result.payment_status,
					redirectUrl: data.payment_result.redirect_url,
					data: data.payment_result.payment_details,
				}
			: null,
	}
}
