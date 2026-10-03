import { Metadata } from "@kizlo/shared"
import z from "zod"
import {
	type AddressAdditionalFields,
	AddressAdditionalFieldsSchema,
	type ContactAdditionalFields,
	ContactAdditionalFieldsSchema,
} from "../additional-fields"
import { BillingAddress, ShippingAddress } from "../schema"

// Reads always normalize the buckets to objects, including responses from older plugins.
const CustomerBillingAddress = BillingAddress.extend({ additionalFields: AddressAdditionalFieldsSchema })
type CustomerBillingAddress = Omit<BillingAddress, "additionalFields"> & { additionalFields: AddressAdditionalFields }
const CustomerShippingAddress = ShippingAddress.extend({ additionalFields: AddressAdditionalFieldsSchema })
type CustomerShippingAddress = Omit<ShippingAddress, "additionalFields"> & { additionalFields: AddressAdditionalFields }

export const Customer = z.object({
	id: z.number(),
	email: z.string(),
	firstName: z.string(),
	lastName: z.string(),
	role: z.string(),
	username: z.string(),
	billing: CustomerBillingAddress,
	shipping: CustomerShippingAddress,
	additionalFields: ContactAdditionalFieldsSchema,
	isPayingCustomer: z.boolean(),
	avatarUrl: z.string().nullable(),
	registeredAt: z.number(),
	meta: Metadata,
})
export type Customer = Omit<z.infer<typeof Customer>, "billing" | "shipping" | "additionalFields"> & {
	billing: CustomerBillingAddress
	shipping: CustomerShippingAddress
	additionalFields: ContactAdditionalFields
}
