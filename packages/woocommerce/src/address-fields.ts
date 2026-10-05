/** Identity shared by Store API address serialization and storefront bindings. */
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
export function deserializeCoreAddress(address: Record<string, unknown>): Required<CoreAddressValues> {
	return Object.fromEntries(Object.entries(CoreAddressFieldKeys).map(([id, key]) => [key, address[id]])) as Required<CoreAddressValues>
}
export function serializeCoreAddress(address: CoreAddressValues): Record<string, string> {
	return Object.fromEntries(
		Object.entries(CoreAddressFieldKeys).flatMap(([id, key]) => (address[key] === undefined ? [] : [[id, address[key]]])),
	)
}
