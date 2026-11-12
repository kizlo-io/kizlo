// @vitest-environment jsdom
import apiFetch from "@wordpress/api-fetch"
import { act, type ButtonHTMLAttributes, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { WhatsAppSettingsPage } from "./whatsapp"

vi.mock("@wordpress/api-fetch", () => ({ default: vi.fn() }))
vi.mock("@/shared/components/ui/button", () => ({
	Button: ({ children, onClick, disabled, type }: ButtonHTMLAttributes<HTMLButtonElement>) => (
		<button type={type} onClick={onClick} disabled={disabled}>
			{children}
		</button>
	),
}))
vi.mock("@/shared/lib/nav", () => ({ sectionsFor: () => (id: string) => ({ id, title: id }) }))
vi.mock("@/shared/components/settings", () => ({
	SettingsForm: ({ children, onSubmit, isDirty }: { children: ReactNode; onSubmit: () => void; isDirty: boolean }) => (
		<form onSubmit={onSubmit}>
			{children}
			<button type="submit" disabled={!isDirty}>
				Save
			</button>
		</form>
	),
	SettingsSection: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}))
vi.mock("@/shared/components/ui/input", () => {
	const Field = ({
		name,
		label,
		value,
		placeholder,
		onChange,
	}: {
		name: string
		label: string
		value: string
		placeholder?: string
		onChange: (value: string) => void
	}) => (
		<label>
			{label}
			<input name={name} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
		</label>
	)
	return { TextInput: Field }
})
let root: Root
let host: HTMLDivElement
beforeEach(async () => {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
	localStorage.clear()
	host = document.createElement("div")
	document.body.append(host)
	root = createRoot(host)
	vi.mocked(apiFetch).mockResolvedValue({ phone_number_id: "123456789", token_set: true, configured: true })
	await act(async () => root.render(<WhatsAppSettingsPage />))
})
afterEach(async () => {
	await act(async () => root.unmount())
	host.remove()
	vi.resetAllMocks()
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})
async function fill(name: string, value: string) {
	const input = host.querySelector<HTMLInputElement>(`input[name="${name}"]`)
	await act(async () => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value)
		input?.dispatchEvent(new Event("input", { bubbles: true }))
	})
}
it("saves a replacement token, clears the input, and sends a test only after an explicit click", async () => {
	expect(apiFetch).toHaveBeenCalledTimes(1)
	expect(host.querySelector<HTMLInputElement>('input[name="whatsapp-api-token"]')?.value).toBe("")
	expect(host.querySelector<HTMLInputElement>('input[name="whatsapp-api-token"]')?.placeholder).toBe("•".repeat(32))
	await fill("whatsapp-phone-number-id", "987654321")
	await act(async () => host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
	expect(apiFetch).toHaveBeenLastCalledWith(expect.objectContaining({ method: "PUT", data: { phone_number_id: "987654321" } }))
	await fill("whatsapp-api-token", "private-new-token")
	await act(async () => host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
	expect(apiFetch).toHaveBeenLastCalledWith(
		expect.objectContaining({ method: "PUT", data: { phone_number_id: "123456789", api_token: "private-new-token" } }),
	)
	expect(host.querySelector<HTMLInputElement>('input[name="whatsapp-api-token"]')?.value).toBe("")
	await fill("whatsapp-test-recipient", "+919876543210")
	expect(apiFetch).toHaveBeenCalledTimes(3)
	const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find((el) => el.textContent === "Send test message")
	await act(async () => button?.click())
	expect(apiFetch).toHaveBeenLastCalledWith({
		path: "/kizlo/v1/settings/integrations/whatsapp/test",
		method: "POST",
		data: { to: "+919876543210" },
	})
	expect(host.textContent).toContain("Meta accepted the test message")
})
it("displays errors without retaining typed secrets", async () => {
	await fill("whatsapp-api-token", "failed-private-token")
	vi.mocked(apiFetch).mockRejectedValueOnce({ message: "Unable to save connection" })
	await act(async () => host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
	expect(host.querySelector('[role="alert"]')?.textContent).toBe("Unable to save connection")
	expect(host.querySelector<HTMLInputElement>('input[name="whatsapp-api-token"]')?.value).toBe("")
})
it("restores the recipient after reopening settings and forgets it when cleared", async () => {
	await fill("whatsapp-test-recipient", "+919876543210")
	await act(async () => root.unmount())
	root = createRoot(host)
	await act(async () => root.render(<WhatsAppSettingsPage />))
	expect(host.querySelector<HTMLInputElement>('input[name="whatsapp-test-recipient"]')?.value).toBe("+919876543210")
	await fill("whatsapp-test-recipient", "")
	await act(async () => root.unmount())
	root = createRoot(host)
	await act(async () => root.render(<WhatsAppSettingsPage />))
	expect(host.querySelector<HTMLInputElement>('input[name="whatsapp-test-recipient"]')?.value).toBe("")
	expect(apiFetch).toHaveBeenCalledTimes(3)
})
it("keeps the recipient editable when browser storage is blocked", async () => {
	vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
		throw new Error("Storage blocked")
	})
	vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
		throw new Error("Storage blocked")
	})
	await act(async () => root.unmount())
	root = createRoot(host)
	await act(async () => root.render(<WhatsAppSettingsPage />))
	await fill("whatsapp-test-recipient", "+919876543210")
	expect(host.querySelector<HTMLInputElement>('input[name="whatsapp-test-recipient"]')?.value).toBe("+919876543210")
})
