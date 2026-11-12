// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query"
import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createQueryClient } from "./query"
import { SecurityLockScreen, SecurityProvider, UserSettings, useSecurity } from "./Security"
import { defaultSecurity, deviceUnlock, registerDevice, type SecurityStatus, securityRequest } from "./security-api"
import { data } from "./test-data"

vi.mock("./security-api", async (original) => ({
	...(await original<typeof import("./security-api")>()),
	securityRequest: vi.fn(),
	deviceUnlock: vi.fn(),
	registerDevice: vi.fn(),
}))
const ready = { ...defaultSecurity, configured: true, locked: false }
let root: Root
let host: HTMLDivElement
beforeEach(() => {
	vi.useFakeTimers()
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
	vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
	localStorage.clear()
	host = document.createElement("div")
	host.className = "kizlo-pos-app"
	document.body.append(host)
	root = createRoot(host)
	vi.mocked(securityRequest).mockImplementation(async (action) => ({ ...ready, locked: action === "/lock" }))
})
afterEach(async () => {
	await act(async () => root.unmount())
	host.remove()
	vi.useRealTimers()
	vi.restoreAllMocks()
	vi.resetAllMocks()
	vi.unstubAllGlobals()
})
function Workspace() {
	const { status, lock } = useSecurity()
	const [draft, setDraft] = useState("Current sale")
	return (
		<>
			<main style={status.locked ? { display: "none" } : undefined} inert={status.locked}>
				<label htmlFor="draft">Draft</label>
				<input id="draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
				<button type="button" onClick={() => void lock()}>
					Lock screen
				</button>
			</main>
			<SecurityLockScreen data={data} />
		</>
	)
}
async function mount(status: SecurityStatus = ready, settings = false) {
	await act(async () =>
		root.render(
			<QueryClientProvider client={createQueryClient()}>
				<SecurityProvider data={{ ...data, security: status }}>{settings ? <UserSettings /> : <Workspace />}</SecurityProvider>
			</QueryClientProvider>,
		),
	)
}
async function input(selector: string, value: string) {
	await act(async () => {
		const el = host.querySelector<HTMLInputElement>(selector)
		expect(el).not.toBeNull()
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, value)
		el?.dispatchEvent(new Event("input", { bubbles: true }))
	})
}
async function keys(value: string[]) {
	await act(async () => {
		for (const key of value) window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
	})
}
async function submit() {
	await act(async () => host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
}
async function click(selector: string) {
	await act(async () => {
		const el = host.querySelector<HTMLButtonElement>(selector)
		expect(el).not.toBeNull()
		el?.click()
	})
}
it("manual lock hides the workspace, blocks dismissal, and restores the current sale only after a valid PIN", async () => {
	await mount()
	await input("#draft", "Customer's current sale")
	await click("main button")
	expect(host.querySelector<HTMLElement>("main")?.style.display).toBe("none")
	expect(host.querySelector(".pos-lock-screen")).not.toBeNull()
	await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })))
	expect(host.querySelector(".pos-lock-screen")).not.toBeNull()
	vi.mocked(securityRequest).mockRejectedValueOnce({ message: "Incorrect PIN", data: { status: 403 } })
	await keys([..."999999"])
	expect(host.textContent).toContain("Incorrect PIN")
	expect(host.querySelectorAll('.pos-pin-dots [data-filled="true"]')).toHaveLength(0)
	await keys([..."012345"])
	expect(securityRequest).toHaveBeenLastCalledWith("/unlock", { pin: "012345" })
	expect(host.querySelector(".pos-lock-screen")).toBeNull()
	expect(host.querySelector<HTMLInputElement>("#draft")?.value).toBe("Customer's current sale")
})
it("locks after 15 minutes without activity and does not send idle heartbeats", async () => {
	await mount()
	await act(async () => vi.advanceTimersByTimeAsync(899_000))
	expect(host.querySelector(".pos-lock-screen")).toBeNull()
	expect(securityRequest).not.toHaveBeenCalled()
	await act(async () => vi.advanceTimersByTimeAsync(1000))
	expect(host.querySelector(".pos-lock-screen")).not.toBeNull()
	expect(securityRequest).toHaveBeenCalledWith("/lock", {})
})
it.each(["pointerdown", "kizlo-pos-activity"])(
	"activity from %s refreshes the configured timer and the server heartbeat",
	async (event) => {
		await mount({ ...ready, idle_minutes: 1 })
		vi.mocked(securityRequest).mockImplementation(async (action) => ({ ...ready, idle_minutes: 1, locked: action === "/lock" }))
		await act(async () => vi.advanceTimersByTimeAsync(50_000))
		await act(async () => window.dispatchEvent(new Event(event)))
		await act(async () => vi.advanceTimersByTimeAsync(10_000))
		expect(securityRequest).toHaveBeenCalledWith("/activity", {})
		expect(host.querySelector(".pos-lock-screen")).toBeNull()
		await act(async () => vi.advanceTimersByTimeAsync(50_000))
		expect(host.querySelector(".pos-lock-screen")).not.toBeNull()
	},
)
it("keeps a manual lock after reload and responds to server and other-tab locks", async () => {
	await mount()
	await click("main button")
	await act(async () => root.unmount())
	root = createRoot(host)
	await mount()
	expect(host.querySelector(".pos-lock-screen")).not.toBeNull()
	await keys([..."012345"])
	await act(async () => window.dispatchEvent(new CustomEvent("kizlo-pos-locked")))
	expect(host.querySelector(".pos-lock-screen")).not.toBeNull()
	await keys([..."012345"])
	await act(async () =>
		window.dispatchEvent(new StorageEvent("storage", { key: `kizlo-pos:lock:${data.restRoot}:${data.user.id}`, newValue: "locked" })),
	)
	expect(host.querySelector(".pos-lock-screen")).not.toBeNull()
})
it("respects the server's remaining idle time after reload and shares activity across tabs", async () => {
	vi.mocked(securityRequest).mockImplementation(async (action) => ({ ...ready, idle_minutes: 1, locked: action === "/lock" }))
	await mount({ ...ready, idle_minutes: 1, idle_remaining: 10 })
	await act(async () => vi.advanceTimersByTimeAsync(9000))
	await act(async () =>
		window.dispatchEvent(
			new StorageEvent("storage", { key: `kizlo-pos:lock:${data.restRoot}:${data.user.id}:activity`, newValue: String(Date.now()) }),
		),
	)
	await act(async () => vi.advanceTimersByTimeAsync(1000))
	expect(host.querySelector(".pos-lock-screen")).toBeNull()
	await act(async () => vi.advanceTimersByTimeAsync(59_000))
	expect(host.querySelector(".pos-lock-screen")).not.toBeNull()
})
it("saves PIN and timeout settings with proof, and clears secrets after saving", async () => {
	await mount(defaultSecurity, true)
	await input("#pos-new-pin", "012345")
	await input("#pos-confirm-pin", "012345")
	await input("#pos-idle-minutes", "20")
	await input("#pos-security-proof", "wordpress-password")
	vi.mocked(securityRequest).mockResolvedValueOnce({ ...ready, idle_minutes: 20 })
	await submit()
	expect(securityRequest).toHaveBeenCalledWith("/settings", {
		idle_minutes: 20,
		new_pin: "012345",
		confirm_pin: "012345",
		password: "wordpress-password",
	})
	expect(host.textContent).toContain("Security settings saved")
	for (const selector of ["#pos-new-pin", "#pos-confirm-pin", "#pos-security-proof"])
		expect(host.querySelector<HTMLInputElement>(selector)?.value).toBe("")
})
it("only offers device unlock when supported and starts registration after an explicit click and PIN", async () => {
	vi.stubGlobal("isSecureContext", true)
	vi.stubGlobal("PublicKeyCredential", { isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true) })
	vi.mocked(registerDevice).mockResolvedValue({ ...ready, passkey_available: true, has_passkey: true })
	await mount({ ...ready, passkey_available: true }, true)
	expect(registerDevice).not.toHaveBeenCalled()
	expect(deviceUnlock).not.toHaveBeenCalled()
	await input("#pos-device-pin", "012345")
	const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find((el) => el.textContent === "Enable device unlock")
	await act(async () => button?.click())
	expect(registerDevice).toHaveBeenCalledWith("012345")
	expect(host.querySelector<HTMLInputElement>("#pos-device-pin")?.value).toBe("")
})

it("an already locked tab does not overwrite another tab's successful unlock", async () => {
	await mount({ ...ready, locked: true })
	const key = `kizlo-pos:lock:${data.restRoot}:${data.user.id}`
	localStorage.setItem(key, "unlocked")
	await act(async () => window.dispatchEvent(new CustomEvent("kizlo-pos-locked")))
	expect(localStorage.getItem(key)).toBe("unlocked")
	expect(host.querySelector(".pos-lock-screen")).not.toBeNull()
})

it("submits keyboard PINs automatically at six digits, supports deletion, and ignores unrelated keys", async () => {
	await mount({ ...ready, locked: true })
	expect(host.querySelector(".pos-lock-screen input")).toBeNull()
	const submitButtons = [...host.querySelectorAll<HTMLButtonElement>('button[aria-label="Unlock POS"]')]
	expect(submitButtons).toHaveLength(2)
	expect(submitButtons.every((button) => button.disabled)).toBe(true)
	await act(async () => {
		for (const button of submitButtons) button.click()
	})
	await keys(["Enter", "a", "ArrowUp"])
	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "1", ctrlKey: true }))
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "2", repeat: true }))
	})
	expect(host.querySelectorAll('.pos-pin-dots [data-filled="true"]')).toHaveLength(0)
	await keys([..."01234"])
	expect(securityRequest).not.toHaveBeenCalled()
	await keys(["Backspace", "7"])
	expect(host.querySelector(".pos-pin-dots")?.getAttribute("aria-label")).toBe("5 of 6 digits entered")
	await keys(["8"])
	expect(securityRequest).toHaveBeenCalledExactlyOnceWith("/unlock", { pin: "012378" })
	expect(host.querySelector(".pos-lock-screen")).toBeNull()
	vi.mocked(securityRequest).mockClear()
	await keys([..."123456", "Enter"])
	expect(securityRequest).not.toHaveBeenCalled()
})
it("submits keypad PINs automatically at six digits and ignores input while unlocking", async () => {
	let reject: (reason: object) => void = () => {}
	vi.mocked(securityRequest).mockImplementationOnce(
		() =>
			new Promise((_, fail) => {
				reject = fail
			}),
	)
	await mount({ ...ready, locked: true })
	for (const digit of "01234") {
		const button = [...host.querySelectorAll<HTMLButtonElement>(".pos-pin-keypad button")].find((el) => el.textContent === digit)
		expect(button).toBeDefined()
		await act(async () => button?.click())
	}
	expect(securityRequest).not.toHaveBeenCalled()
	await click('button[aria-label="Delete last digit"]')
	for (const digit of "45") {
		const button = [...host.querySelectorAll<HTMLButtonElement>(".pos-pin-keypad button")].find((el) => el.textContent === digit)
		await act(async () => button?.click())
	}
	expect(securityRequest).toHaveBeenCalledExactlyOnceWith("/unlock", { pin: "012345" })
	await keys([..."1234567", "Enter"])
	await click('.pos-pin-keypad button[aria-label="Unlock POS"]')
	expect(securityRequest).toHaveBeenCalledTimes(1)
	expect(host.querySelector('[aria-label="Unlocking POS"]')).not.toBeNull()
	await act(async () => reject({ message: "Incorrect PIN", data: { status: 403 } }))
	expect(host.textContent).toContain("Incorrect PIN")
	expect(host.querySelector(".pos-pin-dots")?.getAttribute("aria-label")).toBe("0 of 6 digits entered")
	await keys([..."012345"])
	expect(securityRequest).toHaveBeenCalledTimes(2)
	expect(host.querySelector(".pos-lock-screen")).toBeNull()
})

it("shows a separate recovery screen, keeps POS locked, and returns to an empty PIN entry", async () => {
	await mount({ ...ready, locked: true })
	await keys([..."123"])
	const forgot = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Forgot PIN?")
	expect(forgot).toBeDefined()
	await act(async () => forgot?.click())
	expect(host.textContent).toContain("Contact your administrator to reset your POS PIN.")
	expect(host.querySelector(".pos-pin-keypad, .pos-pin-dots, .pos-lock-screen a")).toBeNull()
	expect(host.querySelector(".pos-lock-screen")).toBe(document.activeElement)
	await keys([..."012345", "Enter", "Escape"])
	expect(securityRequest).not.toHaveBeenCalled()
	expect(host.querySelector<HTMLElement>("main")?.style.display).toBe("none")
	const back = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Back to PIN")
	await act(async () => back?.click())
	expect(host.querySelector(".pos-pin-dots")?.getAttribute("aria-label")).toBe("0 of 6 digits entered")
	await keys([..."012345"])
	expect(securityRequest).toHaveBeenCalledWith("/unlock", { pin: "012345" })
})
