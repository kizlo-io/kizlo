import { Metadata } from "@kizlo/shared"
import z from "zod"
import { Media } from "../shared/schema"

export const User = z.object({
	id: z.number(),
	username: z.string(),
	email: z.string(),
	firstName: z.string(),
	lastName: z.string(),
	nickname: z.string(),
	locale: z.string(),
	description: z.string(),
	avatar: Media.nullable(),
	registeredAt: z.number(),
	meta: Metadata,
})
export type User = z.infer<typeof User>
