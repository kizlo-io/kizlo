import { ArrowRightIcon, CaretLeftIcon, FingerprintIcon, LockKeyIcon, ShieldCheckIcon } from "@phosphor-icons/react"
import { useQueryClient } from "@tanstack/react-query"
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { apiProblem, setPosLocked } from "./api"
import type { Bootstrap } from "./bootstrap"
import { defaultSecurity, deviceUnlock, registerDevice, type SecurityStatus, securityRequest } from "./security-api"

const SecurityContext = createContext({
	status: defaultSecurity,
	busy: false,
	error: "",
	lock: async () => {},
	apply: (_status: SecurityStatus) => {},
	run: async (_work: () => Promise<SecurityStatus>) => false,
})
export const useSecurity = () => useContext(SecurityContext)

export function SecurityProvider({ data, children }: { data: Bootstrap; children: ReactNode }) {
	const key = `kizlo-pos:lock:${data.restRoot}:${data.user.id}`
	const [status, setStatus] = useState<SecurityStatus>(() => {
		const initial = data.security ?? defaultSecurity
		try {
			return { ...initial, locked: initial.locked || (initial.configured && localStorage.getItem(key) === "locked") }
		} catch {
			return initial
		}
	})
	const current = useRef(status)
	current.current = status
	const [busy, setBusy] = useState(false)
	const pending = useRef(false)
	const [error, setError] = useState("")
	const client = useQueryClient()
	const apply = useCallback(
		(next: SecurityStatus) => {
			current.current = next
			setPosLocked(next.locked, next.configured)
			setStatus(next)
			try {
				localStorage.setItem(key, next.locked ? "locked" : "unlocked")
			} catch {
				/* Server session remains authoritative. */
			}
		},
		[key],
	)
	const lock = useCallback(async () => {
		if (!current.current.configured || current.current.locked) return
		apply({ ...current.current, locked: true })
		void client.cancelQueries()
		try {
			apply(await securityRequest("/lock", {}))
		} catch {
			setError("POS is locked on this device. Reconnect before unlocking.")
		}
	}, [apply, client])
	const run = useCallback(
		async (work: () => Promise<SecurityStatus>) => {
			if (pending.current) return false
			pending.current = true
			setBusy(true)
			setError("")
			try {
				apply(await work())
				void client.invalidateQueries({ queryKey: ["pos"] })
				return true
			} catch (failure) {
				setError(
					failure instanceof DOMException && failure.name === "NotAllowedError"
						? "Device verification was cancelled or unavailable. Try your PIN."
						: apiProblem(failure).message,
				)
				return false
			} finally {
				pending.current = false
				setBusy(false)
			}
		},
		[apply, client],
	)
	useEffect(() => {
		const confirm = () => {
			if (current.current.configured && current.current.locked) {
				void securityRequest("/lock", {}).catch(() => setError("POS is locked on this device. Reconnect before unlocking."))
			}
		}
		if (data.security && !data.security.locked && current.current.locked) confirm()
		window.addEventListener("online", confirm)
		return () => window.removeEventListener("online", confirm)
	}, [data.security])
	useEffect(() => {
		setPosLocked(status.locked, status.configured)
		return () => setPosLocked(false)
	}, [status.locked, status.configured])
	useEffect(() => {
		const denied = (event: Event) => {
			const configured = (event as CustomEvent<{ configured?: boolean }>).detail?.configured ?? true
			if (current.current.locked && current.current.configured === configured) return
			apply({ ...current.current, configured, locked: true })
			void client.cancelQueries()
		}
		const sync = (event: StorageEvent) => {
			if (event.key === key && event.newValue === "locked") {
				apply({ ...current.current, locked: true })
				void client.cancelQueries()
			}
		}
		window.addEventListener("kizlo-pos-locked", denied)
		window.addEventListener("storage", sync)
		return () => {
			window.removeEventListener("kizlo-pos-locked", denied)
			window.removeEventListener("storage", sync)
		}
	}, [apply, client, key])
	useEffect(() => {
		if (!status.configured || status.locked) return
		let lastActivity = Date.now() - (status.idle_minutes * 60 - (status.idle_remaining ?? status.idle_minutes * 60)) * 1000
		let sentActivity = lastActivity
		let lastBroadcast = 0
		let sending = false
		const activity = () => {
			lastActivity = Date.now()
			if (lastActivity - lastBroadcast >= 1000) {
				lastBroadcast = lastActivity
				try {
					localStorage.setItem(`${key}:activity`, String(lastActivity))
				} catch {
					/* Server still enforces the timeout. */
				}
			}
		}
		const activityInAnotherTab = (event: StorageEvent) => {
			const timestamp = Number(event.newValue)
			if (event.key === `${key}:activity` && Number.isFinite(timestamp) && timestamp > lastActivity && timestamp <= Date.now())
				lastActivity = timestamp
		}
		const check = () => {
			if (Date.now() - lastActivity >= current.current.idle_minutes * 60_000) void lock()
		}
		const heartbeat = async () => {
			check()
			if (sending || current.current.locked || lastActivity <= sentActivity) return
			sending = true
			sentActivity = lastActivity
			try {
				const next = await securityRequest("/activity", {})
				if (!current.current.locked) apply(next)
			} catch (failure) {
				if ((failure as { data?: { status?: number } })?.data?.status === 423) apply({ ...current.current, locked: true })
			} finally {
				sending = false
			}
		}
		const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "kizlo-pos-activity"]
		for (const event of events) window.addEventListener(event, activity, { passive: true })
		document.addEventListener("visibilitychange", check)
		window.addEventListener("storage", activityInAnotherTab)
		const idle = setInterval(check, 1000)
		const pulse = setInterval(() => void heartbeat(), 15_000)
		return () => {
			for (const event of events) window.removeEventListener(event, activity)
			document.removeEventListener("visibilitychange", check)
			window.removeEventListener("storage", activityInAnotherTab)
			clearInterval(idle)
			clearInterval(pulse)
		}
	}, [status.configured, status.locked, apply, lock, key])
	return <SecurityContext.Provider value={{ status, busy, error, apply, lock, run }}>{children}</SecurityContext.Provider>
}

function useDeviceSupport() {
	const [available, setAvailable] = useState(false)
	useEffect(() => {
		let cancelled = false
		if (
			window.isSecureContext &&
			typeof PublicKeyCredential !== "undefined" &&
			PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable
		) {
			void PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
				.then((supported) => {
					if (!cancelled) setAvailable(supported)
				})
				.catch(() => {})
		}
		return () => {
			cancelled = true
		}
	}, [])
	return available
}

export function SecurityLockScreen({ data }: { data: Bootstrap }) {
	const { status, busy, error, run } = useSecurity()
	const [pin, setPin] = useState("")
	const [recovering, setRecovering] = useState(false)
	const device = useDeviceSupport()
	const [host, setHost] = useState<HTMLElement | null>(null)
	const content = useRef<HTMLDivElement>(null)
	const open = status.locked && status.configured
	useEffect(() => setHost(document.querySelector<HTMLElement>(".kizlo-pos-app")), [])
	useEffect(() => {
		setPin("")
		setRecovering(false)
	}, [open])
	useEffect(() => {
		if (open) content.current?.focus()
	}, [open, recovering])
	const unlock = useCallback(() => {
		if (!open || busy || recovering || pin.length !== 6) return
		const value = pin
		setPin("")
		void run(() => securityRequest("/unlock", { pin: value }))
	}, [busy, open, pin, recovering, run])
	useEffect(() => unlock(), [unlock])
	useEffect(() => {
		if (!open || recovering) return
		const keydown = (event: KeyboardEvent) => {
			if (busy || event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return
			if (/^[0-9]$/.test(event.key)) {
				event.preventDefault()
				setPin((value) => (value + event.key).slice(0, 6))
			} else if (event.key === "Backspace") {
				event.preventDefault()
				setPin((value) => value.slice(0, -1))
			}
		}
		window.addEventListener("keydown", keydown)
		return () => window.removeEventListener("keydown", keydown)
	}, [busy, open, recovering])
	const keyClass =
		"size-16 rounded-full border-0 bg-accent p-0 text-2xl font-normal text-foreground shadow-none hover:bg-border active:bg-border focus-visible:ring-ring [&_svg]:size-6"
	return (
		<Dialog open={open}>
			<DialogContent
				ref={content}
				container={host}
				responsive={false}
				tabIndex={-1}
				className="pos-lock-screen fixed inset-0 z-100 flex h-dvh max-h-none w-full! max-w-none translate-x-0 translate-y-0 flex-col items-center rounded-none! border-0 bg-canvas px-6 py-8 text-foreground shadow-none data-[state=closed]:animate-none data-[state=open]:animate-none [&>button]:hidden"
				onOpenAutoFocus={(event) => {
					event.preventDefault()
					content.current?.focus()
				}}
				onEscapeKeyDown={(event) => event.preventDefault()}
				onPointerDownOutside={(event) => event.preventDefault()}
				onInteractOutside={(event) => event.preventDefault()}
			>
				<div className="my-auto w-full max-w-80 shrink-0 text-center">
					<LockKeyIcon size={20} weight="fill" className="mx-auto mt-2" aria-hidden="true" />
					<DialogTitle className="mt-4 p-0 font-medium text-foreground text-lg">{recovering ? "Forgot PIN?" : "Enter PIN"}</DialogTitle>
					<DialogDescription className={recovering ? "mt-4 text-base text-muted-foreground" : "sr-only"}>
						{recovering
							? "Contact your administrator to reset your POS PIN."
							: `Enter your six-digit PIN to continue as ${data.user.name}.`}
					</DialogDescription>
					{recovering ? (
						<Button type="button" variant="secondary" className="mt-8 w-full" onClick={() => setRecovering(false)}>
							Back to PIN
						</Button>
					) : (
						<>
							<div className="mt-6" aria-busy={busy}>
								<div
									className="pos-pin-dots compact:mb-8 tablet:mb-8 flex h-3 items-center justify-center gap-3.5"
									role="status"
									aria-label={`${pin.length} of 6 digits entered`}
									aria-live="polite"
								>
									{Array.from({ length: 6 }, (_, index) => (
										<span
											key={index}
											aria-hidden="true"
											data-filled={index < pin.length}
											className="size-2 rounded-full bg-border transition-colors data-[filled=true]:bg-foreground"
										/>
									))}
								</div>
								<div
									className="pos-pin-keypad mx-auto compact:grid tablet:grid hidden w-fit grid-cols-3 gap-5"
									role="group"
									aria-label="PIN keypad"
								>
									{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
										<Button
											key={digit}
											type="button"
											className={keyClass}
											disabled={busy}
											onClick={() => setPin((value) => (value + digit).slice(0, 6))}
										>
											{digit}
										</Button>
									))}
									<div className="col-span-3 flex justify-center gap-5">
										<Button
											type="button"
											className={keyClass}
											aria-label="Delete last digit"
											disabled={busy || !pin.length}
											onClick={() => setPin((value) => value.slice(0, -1))}
										>
											<CaretLeftIcon aria-hidden="true" />
										</Button>
										<Button type="button" className={keyClass} disabled={busy} onClick={() => setPin((value) => `${value}0`.slice(0, 6))}>
											0
										</Button>
										<Button type="button" className={keyClass} aria-label="Unlock POS" disabled={busy || pin.length !== 6} onClick={unlock}>
											{busy ? <Spinner aria-label="Unlocking POS" /> : <ArrowRightIcon aria-hidden="true" />}
										</Button>
									</div>
								</div>
								<div className="mt-8 compact:hidden tablet:hidden">
									<Button type="button" className={keyClass} aria-label="Unlock POS" disabled={busy || pin.length !== 6} onClick={unlock}>
										{busy ? <Spinner aria-label="Unlocking POS" /> : <ArrowRightIcon aria-hidden="true" />}
									</Button>
								</div>
							</div>
							<div className="mt-6 flex flex-col items-center gap-3">
								{device && status.passkey_available && status.has_passkey && (
									<Button
										type="button"
										variant="ghost"
										className="text-muted-foreground hover:bg-accent hover:text-foreground"
										disabled={busy}
										onClick={() => void run(deviceUnlock)}
									>
										<FingerprintIcon aria-hidden="true" />
										Use Face ID or fingerprint
									</Button>
								)}
								<button
									type="button"
									className="text-muted-foreground text-xs underline underline-offset-4 hover:text-foreground disabled:opacity-50"
									disabled={busy}
									onClick={() => {
										setPin("")
										setRecovering(true)
									}}
								>
									Forgot PIN?
								</button>
							</div>
							{error && (
								<p role="alert" className="mt-5 text-destructive text-sm">
									{error}
								</p>
							)}
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	)
}

export function UserSettings({ accountUrl }: { accountUrl?: string }) {
	const { status, busy, error, run } = useSecurity()
	const device = useDeviceSupport()
	const [minutes, setMinutes] = useState(status.idle_minutes)
	const [newPin, setNewPin] = useState("")
	const [confirm, setConfirm] = useState("")
	const [proof, setProof] = useState("")
	const [usePassword, setUsePassword] = useState(!status.configured)
	const [devicePin, setDevicePin] = useState("")
	const [message, setMessage] = useState("")
	return (
		<section className="pos-user-settings min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-background mobile:p-4 p-6">
			<div className="mx-auto grid max-w-xl gap-8">
				<header>
					<h1 className="font-semibold text-2xl">User settings</h1>
					<p className="mt-2 text-muted-foreground text-sm">Secure your POS session with a personal PIN and automatic screen lock.</p>
				</header>
				<form
					className="grid gap-5"
					onSubmit={async (event) => {
						event.preventDefault()
						setMessage("")
						const saved = await run(() =>
							securityRequest("/settings", {
								idle_minutes: minutes,
								new_pin: newPin,
								confirm_pin: confirm,
								...(usePassword ? { password: proof } : { pin: proof }),
							}),
						)
						setProof("")
						if (saved) {
							setNewPin("")
							setConfirm("")
							setUsePassword(false)
							setMessage("Security settings saved.")
						}
					}}
				>
					<h2 className="flex items-center gap-2 font-medium">
						<ShieldCheckIcon aria-hidden="true" />
						PIN and auto-lock
					</h2>
					<p className="text-muted-foreground text-sm">
						{status.configured
							? "Your six-digit PIN is configured. Leave the new PIN blank to keep it."
							: "Set a six-digit PIN to open POS and enable automatic locking."}{" "}
						Changing your PIN removes registered passkeys.
					</p>
					<div className="grid grid-cols-2 gap-4">
						<label htmlFor="pos-new-pin" className="grid gap-2 text-sm">
							New PIN
							<Input
								id="pos-new-pin"
								type="password"
								inputMode="numeric"
								pattern="[0-9]{6}"
								maxLength={6}
								minLength={6}
								autoComplete="new-password"
								value={newPin}
								onChange={(event) => setNewPin(event.target.value.replace(/\D/g, ""))}
								required={!status.configured}
							/>
						</label>
						<label htmlFor="pos-confirm-pin" className="grid gap-2 text-sm">
							Confirm new PIN
							<Input
								id="pos-confirm-pin"
								type="password"
								inputMode="numeric"
								pattern="[0-9]{6}"
								maxLength={6}
								autoComplete="new-password"
								value={confirm}
								onChange={(event) => setConfirm(event.target.value.replace(/\D/g, ""))}
								required={Boolean(newPin)}
							/>
						</label>
					</div>
					<label htmlFor="pos-idle-minutes" className="grid gap-2 text-sm">
						Auto-lock after (minutes)
						<Input
							id="pos-idle-minutes"
							type="number"
							min={1}
							max={240}
							value={minutes}
							onChange={(event) => setMinutes(Number(event.target.value))}
							required
						/>
					</label>
					<label htmlFor="pos-security-proof" className="grid gap-2 text-sm">
						{usePassword ? "Current WordPress password" : "Current POS PIN"}
						<Input
							id="pos-security-proof"
							type="password"
							inputMode={usePassword ? "text" : "numeric"}
							autoComplete={usePassword ? "current-password" : "off"}
							value={proof}
							onChange={(event) => setProof(event.target.value)}
							required
						/>
					</label>
					{status.configured && (
						<Button
							type="button"
							variant="link"
							className="justify-start p-0"
							onClick={() => {
								setUsePassword(!usePassword)
								setProof("")
							}}
						>
							{usePassword ? "Use my POS PIN instead" : "Use my WordPress password instead"}
						</Button>
					)}
					<Button type="submit" disabled={busy}>
						{busy ? <Spinner aria-label="Saving settings" /> : "Save security settings"}
					</Button>
				</form>
				{status.configured && status.passkey_available && device && (
					<section className="grid gap-4 border-border border-t pt-6">
						<h2 className="flex items-center gap-2 font-medium">
							<FingerprintIcon aria-hidden="true" />
							Face ID or fingerprint
						</h2>
						<p className="text-muted-foreground text-sm">
							Enable device unlock after confirming your PIN. Your phone handles biometric verification; POS stores a public key.
						</p>
						<label htmlFor="pos-device-pin" className="grid gap-2 text-sm">
							Confirm POS PIN
							<Input
								id="pos-device-pin"
								type="password"
								inputMode="numeric"
								pattern="[0-9]{6}"
								maxLength={6}
								autoComplete="off"
								value={devicePin}
								onChange={(event) => setDevicePin(event.target.value.replace(/\D/g, ""))}
							/>
						</label>
						<Button
							type="button"
							variant="outline"
							disabled={busy || devicePin.length !== 6}
							onClick={async () => {
								setMessage("")
								if (await run(() => registerDevice(devicePin))) setMessage("Device unlock enabled.")
								setDevicePin("")
							}}
						>
							Enable device unlock
						</Button>
						{status.has_passkey && (
							<Button
								type="button"
								variant="outline"
								disabled={busy || devicePin.length !== 6}
								onClick={async () => {
									setMessage("")
									if (await run(() => securityRequest("/passkeys", { pin: devicePin }, "DELETE"))) setMessage("All passkeys removed.")
									setDevicePin("")
								}}
							>
								Remove all passkeys
							</Button>
						)}
					</section>
				)}
				{message && (
					<p role="status" className="text-sm">
						{message}
					</p>
				)}
				{error && (
					<p role="alert" className="text-destructive text-sm">
						{error}
					</p>
				)}
				{accountUrl && (
					<a href={accountUrl} className="text-muted-foreground text-sm underline">
						Open WordPress profile
					</a>
				)}
			</div>
		</section>
	)
}
