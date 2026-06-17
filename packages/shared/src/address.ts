import type { CountryCode } from "./geo"

interface Address {
	address1?: string | undefined | null
	address2?: string | undefined | null
	address_1?: string | undefined | null
	address_2?: string | undefined | null
	city?: string | undefined | null
	province?: string | undefined | null
	postcode?: string | undefined | null
	country?: CountryCode | undefined | null
}

export function toAddressString(address: Address): string {
	const parts = [address.address1, address.address_1, address.address2, address.address_2, address.city]

	if (address.province && address.postcode) {
		parts.push(`${address.province} ${address.postcode}`)
	} else {
		parts.push(address.province)
		parts.push(address.postcode)
	}

	return parts.filter(Boolean).join(", ")
}
