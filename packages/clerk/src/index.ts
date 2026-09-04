import type { ClerkClient, User, WebhookEvent } from "@clerk/backend"
import { verifyWebhook } from "@clerk/backend/webhooks"
import { type AuthUser, createAuthAdapter, createIntegration, createProcedure, KizloError, type ProcedureContext, schemaType } from "kizlo"

/** Receives every verified Clerk event when configured on {@link ClerkWebhookOptions}. */
export type ClerkWebhookHandler = (event: WebhookEvent, context: ProcedureContext) => void | Promise<void>

/** Clerk webhook endpoint configuration. */
export interface ClerkWebhookOptions {
	/** The endpoint signing secret from the Clerk Dashboard. */
	signingSecret: string
	/** Replaces Kizlo's built-in WordPress user lifecycle handling. */
	handler?: ClerkWebhookHandler
}

/** Options for the {@link clerk} integration. */
export interface ClerkOptions {
	/**
	 * A configured Clerk backend client. Use the app's `clerkClient` (`@clerk/nextjs`, `@clerk/express`)
	 * or build one with `createClerkClient` from `@clerk/backend`. Keys and any networkless `jwtKey` live
	 * on this client, so they are configured once where Clerk already reads them.
	 */
	client: ClerkClient
	/** Resolve an email for a user whose Clerk profile has no primary email address. */
	resolveEmail?: (user: User) => string
	/** Register the signed Clerk webhook endpoint. Omit for an auth-only integration. */
	webhooks?: ClerkWebhookOptions
}

type Meta = NonNullable<AuthUser["meta"]>

/** Clerk integration for Kizlo authentication and optional WordPress user lifecycle synchronization. */
export function clerk(options: ClerkOptions) {
	const auth = createAuthAdapter({
		async getSession(request) {
			if (!request) return null

			const state = await options.client.authenticateRequest(request)
			if (!state.isSignedIn) return null

			const { userId } = state.toAuth()
			const user = await options.client.users.getUser(userId)
			return mapUser(user, options)
		},
	})

	const webhooks = options.webhooks ? createWebhookProcedure(options, options.webhooks) : undefined

	return createIntegration({
		id: "clerk",
		adapters: { auth },
		...(webhooks ? { procedures: { webhooks } } : {}),
		...(options.webhooks && !options.webhooks.handler ? { requires: { endpoints: ["users.external"] } } : {}),
	})
}

function createWebhookProcedure(options: ClerkOptions, webhooks: ClerkWebhookOptions) {
	return createProcedure(
		{
			scope: "api",
			method: "POST",
			path: "/webhooks",
			output: schemaType<void>(),
		},
		async ({ context }) => {
			if (!context.request) throw new KizloError("FORBIDDEN", { message: "Clerk webhook verification requires an HTTP request." })

			let event: WebhookEvent
			try {
				event = await verifyWebhook(context.request.clone(), { signingSecret: webhooks.signingSecret })
			} catch (cause) {
				throw new KizloError("FORBIDDEN", { message: "Clerk webhook signature verification failed.", cause })
			}

			if (webhooks.handler) {
				await webhooks.handler(event, context)
				return
			}

			await dispatchUserEvent(event, options, context)
		},
	)
}

async function dispatchUserEvent(event: WebhookEvent, options: ClerkOptions, context: ProcedureContext): Promise<void> {
	switch (event.type) {
		case "user.created":
		case "user.updated": {
			const user = await options.client.users.getUser(event.data.id)
			const result = await context.wordpress.users.external[event.type === "user.created" ? "create" : "update"]({
				provider: "clerk",
				value: user.id,
				email: resolveEmail(user, options),
				first_name: user.firstName ?? "",
				last_name: user.lastName ?? "",
				profile: buildMeta(user) ?? {},
			})
			if (result.error) throw result.error
			return
		}
		case "user.deleted": {
			if (!event.data.id) {
				throw new KizloError("BAD_REQUEST", { message: "Clerk user.deleted event is missing a user id." })
			}
			const result = await context.wordpress.users.external.delete({ provider: "clerk", value: event.data.id })
			if (result.error) throw result.error
			return
		}
	}
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
	const primary = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)
	if (primary) return primary.emailAddress

	const fallback = options.resolveEmail?.(user)
	if (fallback) return fallback

	throw new Error(
		`clerk: could not resolve an email for user "${user.id}". The user has no primary email address. ` +
			"Pass a `resolveEmail` callback when using a non-email identity.",
	)
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
