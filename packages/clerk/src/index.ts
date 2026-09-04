import { createClerkClient, type User } from "@clerk/backend"
import { type AuthUser, createAuthAdapter, createIntegration } from "kizlo"

/** Options for the {@link clerk} integration. */
export interface ClerkOptions {
	/** Clerk secret key (`sk_...`), used to authenticate Backend API calls. */
	secretKey: string
	/** Clerk publishable key (`pk_...`), used to identify the instance during request verification. */
	publishableKey: string
	/** JWKS public key (PEM). When set, session verification is networkless. */
	jwtKey?: string
	/**
	 * Resolve the email that keys this session to a WordPress user. Overrides the built-in
	 * primary-verified-email and phone-synthesis resolution. Return the address; throw to reject.
	 */
	resolveEmail?: (user: User) => string
	/**
	 * Domain used to synthesize an email for phone-only users (`${phone}@${emailDomain}`), when no
	 * verified email is present. Ignored once a verified email or `resolveEmail` resolves one.
	 */
	emailDomain?: string
}

type Meta = NonNullable<AuthUser["meta"]>

/**
 * Clerk auth integration. Maps a verified Clerk session to Kizlo's email-keyed {@link AuthUser}.
 * Contributes the `auth` adapter; there is no WordPress id to inject, since the WordPress user is
 * materialized lazily by the endpoints that need one.
 */
export function clerk(options: ClerkOptions) {
	const client = createClerkClient({
		secretKey: options.secretKey,
		publishableKey: options.publishableKey,
		jwtKey: options.jwtKey,
	})

	const auth = createAuthAdapter({
		async getSession(request) {
			if (!request) return null

			const state = await client.authenticateRequest(request)
			if (!state.isSignedIn) return null

			const { userId } = state.toAuth()
			const user = await client.users.getUser(userId)
			return mapUser(user, options)
		},
	})

	return createIntegration({ id: "clerk", adapters: { auth } })
}

function mapUser(user: User, options: ClerkOptions): AuthUser {
	const authUser: AuthUser = {
		id: user.id,
		email: resolveEmail(user, options),
	}

	if (user.firstName) authUser.firstName = user.firstName
	if (user.lastName) authUser.lastName = user.lastName

	const meta = buildMeta(user)
	if (meta) authUser.meta = meta

	return authUser
}

function resolveEmail(user: User, options: ClerkOptions): string {
	if (options.resolveEmail) return options.resolveEmail(user)

	const verified = verifiedEmail(user)
	if (verified) return verified

	if (options.emailDomain) {
		const phone = primaryPhone(user)
		if (phone) return `${phone.replace(/\D/g, "")}@${options.emailDomain}`
	}

	throw new Error(
		`clerk: could not resolve an email for user "${user.id}". No verified email address is present. ` +
			"Set `emailDomain` to synthesize one from the user's phone number, or pass a `resolveEmail` callback.",
	)
}

/** The primary email when it is verified, otherwise the first verified email. */
function verifiedEmail(user: User): string | undefined {
	const primary = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId && email.verification?.status === "verified")
	if (primary) return primary.emailAddress

	return user.emailAddresses.find((email) => email.verification?.status === "verified")?.emailAddress
}

function primaryPhone(user: User): string | undefined {
	const primary = user.phoneNumbers.find((phone) => phone.id === user.primaryPhoneNumberId)
	return (primary ?? user.phoneNumbers[0])?.phoneNumber
}

function buildMeta(user: User): Meta | undefined {
	const meta: Meta = {}

	if (user.username) meta.username = user.username
	if (user.imageUrl) meta.imageUrl = user.imageUrl
	if (user.publicMetadata && Object.keys(user.publicMetadata).length > 0) {
		meta.publicMetadata = user.publicMetadata as Meta[string]
	}

	return Object.keys(meta).length > 0 ? meta : undefined
}
