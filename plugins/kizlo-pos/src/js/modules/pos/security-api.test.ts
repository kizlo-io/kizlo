import { afterEach, expect, it, vi } from "vitest"
import { apiFetch } from "./api"
import { defaultSecurity, deviceUnlock, registerDevice } from "./security-api"

vi.mock("./api", () => ({ apiFetch: vi.fn() }))
afterEach(() => {
	vi.resetAllMocks()
	vi.unstubAllGlobals()
})
const buffer = (value: string) => Uint8Array.from(value, (char) => char.charCodeAt(0)).buffer
it("decodes server WebAuthn options and sends signed assertion bytes for server verification", async () => {
	vi.mocked(apiFetch)
		.mockResolvedValueOnce({
			publicKey: { challenge: "Zm9v", allowCredentials: [{ id: "YmFy", type: "public-key" }], userVerification: "required" },
		})
		.mockResolvedValueOnce({ ...defaultSecurity, configured: true })
	const get = vi.fn().mockResolvedValue({
		id: "YmFy",
		response: {
			clientDataJSON: buffer("client"),
			authenticatorData: buffer("auth"),
			signature: buffer("signed"),
			userHandle: buffer("12"),
		},
	})
	vi.stubGlobal("navigator", { credentials: { get } })
	await deviceUnlock()
	expect(get).toHaveBeenCalledWith({
		publicKey: { challenge: buffer("foo"), allowCredentials: [{ id: buffer("bar"), type: "public-key" }], userVerification: "required" },
	})
	expect(apiFetch).toHaveBeenLastCalledWith({
		path: "/kizlo-pos/v1/security/passkey/unlock",
		method: "POST",
		data: { id: "YmFy", clientDataJSON: "Y2xpZW50", authenticatorData: "YXV0aA", signature: "c2lnbmVk", userHandle: "MTI" },
	})
})
it("requires a PIN before asking the browser to register and sends attestation for server verification", async () => {
	vi.mocked(apiFetch)
		.mockResolvedValueOnce({
			publicKey: {
				challenge: "Zm9v",
				user: { id: "MTI", name: "staff", displayName: "Staff" },
				excludeCredentials: [{ id: "YmFy", type: "public-key" }],
			},
		})
		.mockResolvedValueOnce(defaultSecurity)
	const create = vi.fn().mockResolvedValue({ response: { clientDataJSON: buffer("client"), attestationObject: buffer("attestation") } })
	vi.stubGlobal("navigator", { credentials: { create } })
	await registerDevice("012345")
	expect(apiFetch).toHaveBeenNthCalledWith(1, {
		path: "/kizlo-pos/v1/security/passkey/register/options",
		method: "POST",
		data: { pin: "012345" },
	})
	expect(create).toHaveBeenCalledWith({
		publicKey: {
			challenge: buffer("foo"),
			user: { id: buffer("12"), name: "staff", displayName: "Staff" },
			excludeCredentials: [{ id: buffer("bar"), type: "public-key" }],
		},
	})
	expect(apiFetch).toHaveBeenLastCalledWith({
		path: "/kizlo-pos/v1/security/passkey/register",
		method: "POST",
		data: { clientDataJSON: "Y2xpZW50", attestationObject: "YXR0ZXN0YXRpb24" },
	})
})
it("does not claim authentication succeeded when the user cancels device verification", async () => {
	vi.mocked(apiFetch).mockResolvedValueOnce({ publicKey: { challenge: "Zm9v", allowCredentials: [] } })
	vi.stubGlobal("navigator", { credentials: { get: vi.fn().mockResolvedValue(null) } })
	await expect(deviceUnlock()).rejects.toThrow("cancelled")
	expect(apiFetch).toHaveBeenCalledTimes(1)
})
