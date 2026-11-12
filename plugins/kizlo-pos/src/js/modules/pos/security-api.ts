import { z } from "zod"
import { apiFetch } from "./api"

export const securitySchema = z.object({
	configured: z.boolean(),
	locked: z.boolean(),
	idle_minutes: z.number().int().min(1).max(240),
	idle_remaining: z.number().int().min(0).max(14_400).optional(),
	has_passkey: z.boolean(),
	passkey_available: z.boolean(),
})
export type SecurityStatus = z.infer<typeof securitySchema>
export const defaultSecurity: SecurityStatus = {
	configured: false,
	locked: true,
	idle_minutes: 15,
	has_passkey: false,
	passkey_available: false,
}
export async function securityRequest(action: string, data?: object, method = "POST"): Promise<SecurityStatus> {
	return securitySchema.parse(await apiFetch({ path: `/kizlo-pos/v1/security${action}`, method, data }))
}
function bytes(value: string): ArrayBuffer {
	const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"))
	return Uint8Array.from(binary, (char) => char.charCodeAt(0)).buffer
}
function encoded(value: ArrayBuffer): string {
	return btoa(Array.from(new Uint8Array(value), (byte) => String.fromCharCode(byte)).join(""))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "")
}
export async function deviceUnlock(): Promise<SecurityStatus> {
	const options = await apiFetch<{
		publicKey: Omit<PublicKeyCredentialRequestOptions, "challenge" | "allowCredentials"> & {
			challenge: string
			allowCredentials: { id: string; type: "public-key" }[]
		}
	}>({ path: "/kizlo-pos/v1/security/passkey/unlock/options", method: "POST", data: {} })
	const publicKey = {
		...options.publicKey,
		challenge: bytes(options.publicKey.challenge),
		allowCredentials: options.publicKey.allowCredentials.map((key) => ({ ...key, id: bytes(key.id) })),
	}
	const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null
	if (!credential) throw new Error("Device unlock was cancelled. You can use your PIN instead.")
	const response = credential.response as AuthenticatorAssertionResponse
	return securityRequest("/passkey/unlock", {
		id: credential.id,
		clientDataJSON: encoded(response.clientDataJSON),
		authenticatorData: encoded(response.authenticatorData),
		signature: encoded(response.signature),
		userHandle: response.userHandle ? encoded(response.userHandle) : null,
	})
}
export async function registerDevice(pin: string): Promise<SecurityStatus> {
	const options = await apiFetch<{
		publicKey: Omit<PublicKeyCredentialCreationOptions, "challenge" | "user" | "excludeCredentials"> & {
			challenge: string
			user: { id: string; name: string; displayName: string }
			excludeCredentials: { id: string; type: "public-key" }[]
		}
	}>({ path: "/kizlo-pos/v1/security/passkey/register/options", method: "POST", data: { pin } })
	const publicKey = {
		...options.publicKey,
		challenge: bytes(options.publicKey.challenge),
		user: { ...options.publicKey.user, id: bytes(options.publicKey.user.id) },
		excludeCredentials: options.publicKey.excludeCredentials?.map((key) => ({ ...key, id: bytes(key.id) })),
	}
	const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null
	if (!credential) throw new Error("Device setup was cancelled. Your PIN still works.")
	const response = credential.response as AuthenticatorAttestationResponse
	return securityRequest("/passkey/register", {
		clientDataJSON: encoded(response.clientDataJSON),
		attestationObject: encoded(response.attestationObject),
	})
}
