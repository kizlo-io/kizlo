import apiFetch from "@wordpress/api-fetch"
import { type FormEvent, useEffect, useState } from "react"
import { SettingsForm, SettingsSection } from "@/shared/components/settings"
import { Button } from "@/shared/components/ui/button"
import { TextInput } from "@/shared/components/ui/input"
import { sectionsFor } from "@/shared/lib/nav"
import { settingsErrorMessage } from "@/shared/lib/settings-error"

const S = sectionsFor("integrations/whatsapp")
const path = "/kizlo/v1/settings/integrations/whatsapp"
const recipientStorageKey = "kizlo:whatsapp:test-recipient"
type Status = { phone_number_id: string; token_set: boolean; configured: boolean }

export function WhatsAppSettingsPage() {
	const [saved, setSaved] = useState<Status | null>(null)
	const [phone, setPhone] = useState("")
	const [token, setToken] = useState("")
	const [recipient, setRecipient] = useState(() => {
		try {
			return localStorage.getItem(recipientStorageKey) ?? ""
		} catch {
			return ""
		}
	})
	const [busy, setBusy] = useState(false)
	const [testing, setTesting] = useState(false)
	const [error, setError] = useState("")
	const [message, setMessage] = useState("")
	const dirty = saved !== null && (phone !== saved.phone_number_id || token !== "")
	useEffect(() => {
		const controller = new AbortController()
		void apiFetch<Status>({ path, signal: controller.signal })
			.then((status) => {
				setSaved(status)
				setPhone(status.phone_number_id)
			})
			.catch((failure) => {
				if (!controller.signal.aborted) setError(settingsErrorMessage(failure))
			})
		return () => controller.abort()
	}, [])
	const save = async () => {
		if (busy || testing || !saved) return
		setBusy(true)
		setError("")
		setMessage("")
		try {
			const status = await apiFetch<Status>({
				path,
				method: "PUT",
				data: { phone_number_id: phone, ...(token !== "" ? { api_token: token } : {}) },
			})
			setSaved(status)
			setPhone(status.phone_number_id)
			setMessage("WhatsApp settings saved.")
		} catch (failure) {
			setError(settingsErrorMessage(failure))
		} finally {
			setToken("")
			setBusy(false)
		}
	}
	const test = async () => {
		if (testing || busy || dirty || !saved?.configured) return
		setTesting(true)
		setError("")
		setMessage("")
		try {
			await apiFetch({ path: `${path}/test`, method: "POST", data: { to: recipient } })
			setMessage(
				"Meta accepted the test message. Check the recipient’s WhatsApp, then reply to open the messaging window for payment links.",
			)
		} catch (failure) {
			setError(settingsErrorMessage(failure))
		} finally {
			setTesting(false)
		}
	}
	return (
		<SettingsForm
			isLoading={busy}
			isDirty={dirty}
			onSubmit={(event: FormEvent<HTMLFormElement>) => {
				event.preventDefault()
				void save()
			}}
			onCancel={() => {
				setPhone(saved?.phone_number_id ?? "")
				setToken("")
			}}
		>
			<SettingsSection {...S("connection")}>
				<p role="status" className="m-0 text-neutral-500 text-sm">
					{saved ? (saved.configured ? "Configured — send a test message to verify delivery." : "Not configured") : "Loading connection…"}
				</p>
				<TextInput
					name="whatsapp-phone-number-id"
					label="Phone number ID"
					desc="Copy the phone number ID below your sender in Meta. This is different from the phone number."
					value={phone}
					onChange={setPhone}
					disabled={!saved || busy || testing}
				/>
				<TextInput
					name="whatsapp-api-token"
					label="API token"
					type="text"
					placeholder={saved?.token_set ? "•".repeat(32) : "Enter API token"}
					desc={
						saved?.token_set
							? "A token is saved. Leave this blank to keep it, or enter a replacement. Temporary Meta tokens expire and may need replacing."
							: "Generate an API token in Meta. The saved token is kept on the server and is never displayed again."
					}
					value={token}
					onChange={setToken}
					disabled={!saved || busy || testing}
				/>
			</SettingsSection>
			<SettingsSection {...S("test-message")}>
				<TextInput
					name="whatsapp-test-recipient"
					label="Recipient phone number"
					placeholder="+919876543210"
					value={recipient}
					onChange={(value) => {
						setRecipient(value)
						try {
							if (value) localStorage.setItem(recipientStorageKey, value)
							else localStorage.removeItem(recipientStorageKey)
						} catch {
							// The recipient remains editable when browser storage is blocked.
						}
					}}
					disabled={busy || testing}
				/>
				<Button
					type="button"
					variant="secondary"
					disabled={!saved?.configured || dirty || busy || testing || !recipient.trim()}
					onClick={() => void test()}
				>
					{testing ? "Sending test…" : "Send test message"}
				</Button>
				{dirty && <p className="m-0 text-neutral-500 text-sm">Save your connection changes before sending a test.</p>}
			</SettingsSection>
			{error && (
				<p role="alert" className="m-0 text-red-700 text-sm">
					{error}
				</p>
			)}
			{message && (
				<p role="status" className="m-0 text-neutral-600 text-sm">
					{message}
				</p>
			)}
		</SettingsForm>
	)
}
