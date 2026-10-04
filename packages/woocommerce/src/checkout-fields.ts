import {
	BillingFieldProjections,
	type BillingProjectedFields,
	type ProjectedBillingFieldId,
	type RegisteredFieldGroup,
	type RegisteredFieldLocations,
	type RegisteredFieldTarget,
	registeredFieldTarget,
} from "./field-projections"

/** The same identity contract used by address hydration, serialization and metadata. */
export const CoreAddressFieldKeys = {
	first_name: "firstName",
	last_name: "lastName",
	company: "company",
	address_1: "address1",
	address_2: "address2",
	city: "city",
	state: "state",
	postcode: "postcode",
	country: "country",
	phone: "phone",
} as const

export type CoreAddressValues = { [K in (typeof CoreAddressFieldKeys)[keyof typeof CoreAddressFieldKeys]]?: string }
export type CheckoutFieldAddress = CoreAddressValues & Partial<BillingProjectedFields> & { email?: string; additionalFields?: object }

export function deserializeCoreAddress(address: Record<string, unknown>): Required<CoreAddressValues> {
	return Object.fromEntries(
		Object.entries(CoreAddressFieldKeys).map(([id, property]) => [property, address[id]]),
	) as Required<CoreAddressValues>
}

/** No defaults: an absent property stays absent in partial updates and rule snapshots. */
export function serializeCoreAddress(address: CoreAddressValues): Record<string, string> {
	return Object.fromEntries(
		Object.entries(CoreAddressFieldKeys).flatMap(([id, property]) => (address[property] === undefined ? [] : [[id, address[property]]])),
	)
}

/** Metadata targets describe identity, including hidden fields; persistence exclusions remain serializer-owned. */
export type CheckoutFieldPath<TId extends string, TGroup extends RegisteredFieldGroup | undefined> = string extends TId
	? readonly string[]
	: TId extends "email"
		? readonly ["billingAddress", "email"]
		: TId extends keyof typeof CoreAddressFieldKeys
			? readonly [`${Extract<TGroup, "billing" | "shipping">}Address`, (typeof CoreAddressFieldKeys)[TId]]
			: TGroup extends "billing"
				? TId extends ProjectedBillingFieldId
					? readonly ["billingAddress", keyof typeof BillingFieldProjections]
					: readonly ["billingAddress", "additionalFields", TId]
				: TGroup extends "shipping"
					? readonly ["shippingAddress", "additionalFields", TId]
					: readonly ["additionalFields", TId]

export function resolveCheckoutFieldTarget<TId extends string, TGroup extends RegisteredFieldGroup | undefined = undefined>(
	locations: RegisteredFieldLocations,
	id: TId,
	group?: TGroup,
): (Omit<RegisteredFieldTarget, "path"> & { path: CheckoutFieldPath<TId, TGroup> }) | null

export function resolveCheckoutFieldTarget(
	locations: RegisteredFieldLocations,
	id: string,
	group?: RegisteredFieldGroup,
): RegisteredFieldTarget | null {
	const matches = (Object.keys(locations) as (keyof RegisteredFieldLocations)[]).filter((location) => locations[location].includes(id))
	const location = matches[0]
	if (matches.length !== 1 || location === undefined) return null
	if (id === "email") {
		return location === "contact" && (group === undefined || group === "other")
			? { id, location, group: "other", path: ["billingAddress", "email"], wirePath: ["billing_address", "email"] }
			: null
	}

	if (location !== "address") return registeredFieldTarget(locations, id, group, "checkout", true)
	if (group !== "billing" && group !== "shipping") return null
	const core = Object.hasOwn(CoreAddressFieldKeys, id) ? CoreAddressFieldKeys[id as keyof typeof CoreAddressFieldKeys] : undefined
	if (!core) return registeredFieldTarget(locations, id, group, "checkout", true)
	return { id, location, group, path: [`${group}Address`, core], wirePath: [`${group}_address`, id] }
}

/** Woo's flattened address document, using the shared reverse native projection rather than consumer tables. */
export function checkoutFieldAddress(address: CheckoutFieldAddress, group: "billing" | "shipping"): Record<string, unknown> {
	const fields: Record<string, unknown> = {
		...Object.fromEntries(
			Object.entries(address.additionalFields ?? {}).filter(([id]) => id !== "email" && !Object.hasOwn(CoreAddressFieldKeys, id)),
		),
		...serializeCoreAddress(address),
		...(group === "billing" && address.email !== undefined && { email: address.email }),
	}
	for (const [property, projection] of Object.entries(BillingFieldProjections)) {
		const value = address[property as keyof typeof BillingFieldProjections]
		if (projection.group === group && value !== undefined) fields[projection.id] = value
	}
	return fields
}
