import { Metadata } from "@kizlo/shared"
import z from "zod"
import { BillingAddress, ShippingAddress } from "../schema"

export const Customer = z.object({
	id: z.number(),
	email: z.string(),
	firstName: z.string(),
	lastName: z.string(),
	role: z.string(),
	username: z.string(),
	billing: BillingAddress,
	shipping: ShippingAddress,
	isPayingCustomer: z.boolean(),
	avatarUrl: z.string().nullable(),
	registeredAt: z.number(),
	meta: Metadata,
})
export type Customer = z.infer<typeof Customer>
