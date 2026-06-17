import { Webhook } from "standardwebhooks"

interface SignWebhookOptions {
	/**
	 * Webhook secret used to sign the payload
	 */
	secret: string

	/**
	 * Unique identifier for this webhook message
	 */
	messageId: string

	/**
	 * Time the webhook was sent, used to prevent replay attacks
	 */
	timestamp: Date

	/**
	 * JSON stringified payload to sign
	 */
	payload: string
}

interface VerifyWebhookOptions {
	/**
	 * Webhook secret used to verify the payload
	 */
	secret: string

	/**
	 * Raw request body as string — must not be parsed
	 */
	payload: string

	/**
	 * Request headers containing webhook-id, webhook-timestamp, webhook-signature
	 */
	headers: Record<string, string>
}

/**
 * Signs a webhook payload using the provided secret.
 *
 * @returns Signature string to be sent in the `webhook-signature` header
 */
export function signWebhook({ secret, messageId, timestamp, payload }: SignWebhookOptions) {
	const wh = new Webhook(Buffer.from(secret).toString("base64"))
	return wh.sign(messageId, timestamp, payload)
}

/**
 * Verifies an incoming webhook payload against its signature.
 *
 * @throws {Error} If the signature is invalid or the timestamp is older than 5 minutes
 */
export function verifyWebhook({ secret, payload, headers }: VerifyWebhookOptions) {
	const wh = new Webhook(Buffer.from(secret).toString("base64"))
	return wh.verify(payload, headers)
}
