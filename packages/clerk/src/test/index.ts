import type { User } from "@clerk/backend"

/** A single email address on a {@link clerkUserFixture}. Verified and primary unless overridden. */
export interface FixtureEmail {
	email: string
	/** Whether Clerk has verified this address. Defaults to `true`. */
	verified?: boolean
	/** Whether this is the user's primary email. Defaults to the first email. */
	primary?: boolean
}

/** A single phone number on a {@link clerkUserFixture}. Primary unless overridden. */
export interface FixturePhone {
	phone: string
	/** Whether this is the user's primary phone. Defaults to the first phone. */
	primary?: boolean
}

/** Shape used to build a {@link clerkUserFixture}. Every field is optional. */
export interface ClerkUserFixtureOptions {
	id?: string
	firstName?: string | null
	lastName?: string | null
	username?: string | null
	imageUrl?: string
	publicMetadata?: Record<string, unknown>
	emails?: FixtureEmail[]
	phones?: FixturePhone[]
}

/**
 * Build a Backend `User`-shaped object for testing the Clerk adapter's mapping, without a live
 * Clerk instance. Only the fields the adapter reads are populated; the result is cast to `User`.
 */
export function clerkUserFixture(options: ClerkUserFixtureOptions = {}): User {
	const emails = options.emails ?? []
	const phones = options.phones ?? []

	const emailAddresses = emails.map((entry, index) => ({
		id: `idn_email_${index}`,
		emailAddress: entry.email,
		verification: { status: entry.verified === false ? "unverified" : "verified" },
	}))

	const phoneNumbers = phones.map((entry, index) => ({
		id: `idn_phone_${index}`,
		phoneNumber: entry.phone,
		verification: { status: "verified" },
	}))

	const primaryEmailIndex = emails.findIndex((entry) => entry.primary)
	const primaryPhoneIndex = phones.findIndex((entry) => entry.primary)

	return {
		id: options.id ?? "user_test",
		firstName: options.firstName ?? null,
		lastName: options.lastName ?? null,
		username: options.username ?? null,
		imageUrl: options.imageUrl ?? "",
		publicMetadata: options.publicMetadata ?? {},
		emailAddresses,
		phoneNumbers,
		primaryEmailAddressId: emailAddresses[primaryEmailIndex === -1 ? 0 : primaryEmailIndex]?.id ?? null,
		primaryPhoneNumberId: phoneNumbers[primaryPhoneIndex === -1 ? 0 : primaryPhoneIndex]?.id ?? null,
	} as unknown as User
}
