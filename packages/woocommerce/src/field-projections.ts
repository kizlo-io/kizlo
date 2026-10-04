import z from "zod/v4"

/** The native API is a projection of a registered value, never a second storage field. */
export const BillingFieldProjections = {
	taxId: {
		id: "kizlo/tax-id",
		location: "address",
		group: "billing",
		excludedGroups: ["shipping"],
		schema: z.string().default(""),
	},
} as const

type Projections = typeof BillingFieldProjections
export type ProjectedBillingFieldId = Projections[keyof Projections]["id"]
export type BillingProjectedFields = { [K in keyof Projections]: z.output<Projections[K]["schema"]> }

export const BillingNativeFields = Object.fromEntries(
	Object.entries(BillingFieldProjections).map(([property, projection]) => [property, projection.schema]),
) as { [K in keyof Projections]: Projections[K]["schema"] }

/** Partial updates must not execute the response/full-submission default for an omitted property. */
export const BillingNativeInputFields = Object.fromEntries(
	Object.entries(BillingFieldProjections).map(([property, projection]) => [property, projection.schema.removeDefault().optional()]),
) as { [K in keyof Projections]: z.ZodOptional<ReturnType<Projections[K]["schema"]["removeDefault"]>> }

export function isProjectedBillingField(id: string): boolean {
	return Object.values(BillingFieldProjections).some((projection) => projection.id === id)
}

/** Preserve the existing billing-only policy independently of Woo's address registration and UI rules. */
export function isExcludedRegisteredField(id: string, group: RegisteredFieldGroup): boolean {
	return Object.values(BillingFieldProjections).some(
		(projection) => projection.id === id && (projection.excludedGroups as readonly string[]).includes(group),
	)
}

export function deserializeBillingFields(fields: Record<string, unknown>): BillingProjectedFields {
	return Object.fromEntries(
		Object.entries(BillingFieldProjections).map(([property, projection]) => {
			const parsed = projection.schema.safeParse(fields[projection.id])
			return [property, parsed.success ? parsed.data : projection.schema.parse(undefined)]
		}),
	) as BillingProjectedFields
}

/** Bypass callers must obey the same single-value contract as typed/schema-validated callers. */
export function serializeBillingFields(address: Partial<BillingProjectedFields> & { additionalFields?: object }): Record<string, string> {
	const fields: Record<string, string> = {}
	for (const [property, projection] of Object.entries(BillingFieldProjections)) {
		if (Object.hasOwn(address.additionalFields ?? {}, projection.id)) {
			throw new TypeError(`Use billingAddress.${property} instead of additionalFields["${projection.id}"].`)
		}
		const value = address[property as keyof BillingProjectedFields]
		if (value !== undefined) fields[projection.id] = value
	}
	return fields
}

export type RegisteredFieldLocations = { address: readonly string[]; contact: readonly string[]; order: readonly string[] }
export type RegisteredFieldGroup = "billing" | "shipping" | "other"
export type RegisteredFieldTarget = {
	id: string
	location: keyof RegisteredFieldLocations
	group: RegisteredFieldGroup
	path: readonly string[]
	wirePath: readonly string[]
}

/** Resolve only registered, unambiguous identities. Group-level errors need no invented leaf target. */
export function resolveRegisteredFieldTarget(
	locations: RegisteredFieldLocations,
	id: string,
	group?: RegisteredFieldGroup,
	surface: "checkout" | "customer" = "checkout",
): RegisteredFieldTarget | null {
	const matches = (Object.keys(locations) as (keyof RegisteredFieldLocations)[]).filter((location) => locations[location].includes(id))
	const location = matches[0]
	if (matches.length !== 1 || location === undefined) return null
	if (location !== "address") {
		if ((group !== undefined && group !== "other") || (surface === "customer" && location === "order")) return null
		return { id, location, group: "other", path: ["additionalFields", id], wirePath: ["additional_fields", id] }
	}
	if (group !== "billing" && group !== "shipping") return null
	if (isExcludedRegisteredField(id, group)) return null
	const address = surface === "customer" ? group : `${group}Address`
	const wireAddress = surface === "customer" ? group : `${group}_address`
	const projection = Object.entries(BillingFieldProjections).find(([, projection]) => projection.id === id && projection.group === group)
	return {
		id,
		location,
		group,
		path: projection ? [address, projection[0]] : [address, "additionalFields", id],
		wirePath: surface === "customer" ? [wireAddress, "additional_fields", id] : [wireAddress, id],
	}
}
