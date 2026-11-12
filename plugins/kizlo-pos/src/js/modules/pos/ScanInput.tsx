import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { apiProblem } from "./api"
import { Icon } from "./Icon"

export async function startCamera(
	video: HTMLVideoElement,
	accept: (code: string) => Promise<void>,
): Promise<{ stop: () => void; rearm: () => void; setTorch?: (enabled: boolean) => Promise<void> }> {
	const { createBarcodeReader } = await import("./barcode-decoder")
	const reader = createBarcodeReader(video)
	let previous = ""
	let busy = false
	let stopped = false
	const controls = await reader.decodeFromConstraints(
		{ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
		video,
		(result) => {
			const code = result?.getText()
			if (!code || stopped || busy || code === previous) return
			previous = code
			busy = true
			void accept(code).finally(() => {
				busy = false
			})
		},
	)
	let setTorch: ((enabled: boolean) => Promise<void>) | undefined
	try {
		const track = (video.srcObject as MediaStream | null)?.getVideoTracks()[0]
		const capabilities = track?.getCapabilities?.() as
			| (MediaTrackCapabilities & { focusMode?: string[]; torch?: boolean | boolean[] })
			| undefined
		const torch = capabilities?.torch
		if (track && (torch === true || (Array.isArray(torch) && torch.includes(true) && torch.includes(false)))) {
			setTorch = async (enabled) => {
				if (stopped) throw new Error("Camera closed.")
				const constraints = track.getConstraints()
				await track.applyConstraints({
					...constraints,
					advanced: [
						...(constraints.advanced ?? []).map((entry) => ({ ...entry, torch: enabled })),
						{ torch: enabled } as MediaTrackConstraintSet,
					],
				})
				const actual = (track.getSettings() as MediaTrackSettings & { torch?: boolean }).torch
				if (typeof actual === "boolean" && actual !== enabled) throw new Error("Flashlight request was ignored.")
			}
		}
		if (track && capabilities?.focusMode?.includes("continuous")) {
			void track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {})
		}
	} catch {
		// Focus controls are optional; keep the camera's native behavior when unavailable.
	}
	return {
		setTorch,
		rearm: () => {
			if (!busy) previous = ""
		},
		stop: () => {
			stopped = true
			controls.stop()
			const stream = video.srcObject
			if (typeof MediaStream !== "undefined" && stream instanceof MediaStream) for (const track of stream.getTracks()) track.stop()
			video.srcObject = null
		},
	}
}

export function ScanInput({
	onScan,
	autofocus = false,
}: {
	onScan: (code: string, source?: "camera") => Promise<void> | Promise<string | undefined>
	autofocus?: boolean
}) {
	const input = useRef<HTMLInputElement>(null)
	const [code, setCode] = useState("")
	const [error, setError] = useState("")
	const [camera, setCamera] = useState(false)
	const [cameraAvailable, setCameraAvailable] = useState(false)
	const [scanning, setScanning] = useState(false)
	const [torchAvailable, setTorchAvailable] = useState(false)
	const [torchOn, setTorchOn] = useState(false)
	const [torchBusy, setTorchBusy] = useState(false)
	const [torchError, setTorchError] = useState("")
	const torchPending = useRef(false)
	const [feedback, setFeedback] = useState<{ state: "idle" | "loading" | "success" | "error"; message: string }>({
		state: "idle",
		message: "Ready for the next product",
	})
	const controls = useRef<Awaited<ReturnType<typeof startCamera>> | null>(null)
	const session = useRef(0)
	const pending = useRef(false)
	const audio = useRef<AudioContext | null>(null)
	const audioReady = useRef<Promise<void> | null>(null)
	const [video, setVideo] = useState<HTMLVideoElement | null>(null)
	const scanRef = useRef(onScan)
	scanRef.current = onScan
	const [host, setHost] = useState<HTMLElement | null>(null)
	const enableSound = () => {
		try {
			const Context = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
			if (!Context) return
			if (!audio.current || audio.current.state === "closed") audio.current = new Context()
			audioReady.current = audio.current.resume().catch(() => {})
		} catch {
			/* Audio availability must not block scanning. */
		}
	}
	const beep = async (failed = false) => {
		try {
			const context = audio.current
			await audioReady.current
			if (audio.current !== context || context?.state !== "running") return
			const oscillator = context.createOscillator()
			const gain = context.createGain()
			const now = context.currentTime
			oscillator.type = failed ? "sine" : "square"
			oscillator.frequency.setValueAtTime(failed ? 660 : 2800, now)
			const duration = failed ? 0.22 : 0.08
			const volume = failed ? 0.12 : 0.1
			gain.gain.setValueAtTime(0.0001, now)
			gain.gain.linearRampToValueAtTime(volume, now + (failed ? 0.006 : 0.002))
			if (failed) {
				gain.gain.setValueAtTime(volume, now + 0.055)
				gain.gain.linearRampToValueAtTime(0.0001, now + 0.08)
				gain.gain.setValueAtTime(0.0001, now + 0.115)
				oscillator.frequency.setValueAtTime(440, now + 0.115)
				gain.gain.linearRampToValueAtTime(volume, now + 0.121)
			}
			gain.gain.setValueAtTime(volume, now + duration - 0.02)
			gain.gain.linearRampToValueAtTime(0.0001, now + duration)
			oscillator.connect(gain)
			gain.connect(context.destination)
			oscillator.onended = () => {
				oscillator.disconnect()
				gain.disconnect()
			}
			oscillator.start(now)
			oscillator.stop(now + duration)
		} catch {
			/* Keep a successful scan successful even when audio is blocked. */
		}
	}
	useEffect(
		() => () => {
			if (audio.current && audio.current.state !== "closed") void audio.current.close().catch(() => {})
			audio.current = null
			audioReady.current = null
		},
		[],
	)
	useEffect(() => {
		setHost(document.querySelector<HTMLElement>(".kizlo-pos-app"))
	}, [])
	useEffect(() => {
		const media = window.matchMedia("(max-width: 1099px), (any-pointer: coarse)")
		const update = () => {
			setCameraAvailable(media.matches)
			if (!media.matches) setCamera(false)
		}
		update()
		media.addEventListener("change", update)
		return () => media.removeEventListener("change", update)
	}, [])
	useEffect(() => {
		if (autofocus && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName ?? "")) input.current?.focus()
	}, [autofocus])
	const submit = async (value: string, cameraRead = false) => {
		if (!value || pending.current) return
		const token = session.current
		if (cameraRead) {
			void beep()
			setFeedback({ state: "loading", message: "Checking and adding product…" })
		}
		pending.current = true
		setError("")
		setScanning(true)
		try {
			const message = await (cameraRead ? scanRef.current(value, "camera") : scanRef.current(value))
			if (cameraRead && session.current !== token) return
			if (cameraRead) setFeedback({ state: "success", message: message || "Product added to sale" })
			else void beep()
			setCode("")
			if (
				!cameraRead &&
				(document.activeElement === input.current || !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName ?? ""))
			)
				input.current?.focus()
		} catch (failure) {
			if (cameraRead && session.current !== token) return
			const message = apiProblem(failure).message
			setError(message)
			if (cameraRead) {
				setFeedback({ state: "error", message })
				void beep(true)
			}
		} finally {
			pending.current = false
			setScanning(false)
		}
	}
	const toggleTorch = async () => {
		const reader = controls.current
		if (!reader?.setTorch || torchPending.current) return
		torchPending.current = true
		setTorchBusy(true)
		setTorchError("")
		const enabled = !torchOn
		try {
			await reader.setTorch(enabled)
			if (controls.current === reader) setTorchOn(enabled)
		} catch {
			if (controls.current === reader) setTorchError("Flashlight could not be changed. Try again or use more light.")
		} finally {
			torchPending.current = false
			setTorchBusy(false)
		}
	}
	const submitRef = useRef(submit)
	submitRef.current = submit
	useEffect(() => {
		// The sheet portal mounts after opening; start only once its video exists.
		if (!camera || !video) return
		const target = video
		let cancelled = false
		let stop: (() => void) | undefined
		const hide = () => {
			if (document.hidden) setCamera(false)
		}
		document.addEventListener("visibilitychange", hide)
		void startCamera(target, async (value) => {
			if (cancelled) return
			setCode(value)
			await submitRef.current(value, true)
		})
			.then((reader) => {
				stop = reader.stop
				if (cancelled) reader.stop()
				else {
					controls.current = reader
					setTorchAvailable(Boolean(reader.setTorch))
				}
			})
			.catch(() => {
				if (!cancelled) {
					setError("Camera unavailable or permission denied. Enter a code or use a keyboard-mode scanner.")
					setCamera(false)
				}
			})
		return () => {
			cancelled = true
			session.current++
			controls.current = null
			setTorchAvailable(false)
			stop?.()
			document.removeEventListener("visibilitychange", hide)
		}
	}, [camera, video])
	return (
		<div className="pos-scan">
			<form
				onSubmit={(event) => {
					event.preventDefault()
					enableSound()
					void submit(code)
				}}
			>
				<label htmlFor="pos-barcode">Scan or enter a barcode / exact SKU</label>
				<div className="pos-scan-actions">
					<Input
						id="pos-barcode"
						ref={input}
						value={code}
						maxLength={64}
						autoComplete="off"
						onChange={(event) => setCode(event.target.value)}
					/>
					<Button type="submit" disabled={scanning || !code}>
						{scanning ? "Looking up…" : "Find"}
					</Button>
					{cameraAvailable && (
						<Button
							type="button"
							variant="outline"
							disabled={scanning}
							onClick={() => {
								enableSound()
								setError("")
								setFeedback({ state: "idle", message: "Ready for the next product" })
								setTorchOn(false)
								setTorchError("")
								setCamera(true)
							}}
						>
							Use camera
						</Button>
					)}
				</div>
			</form>
			{error && !camera && <p role="alert">{error}</p>}
			<Sheet open={camera} onOpenChange={setCamera}>
				<SheetContent container={host} className="pos-camera" side="bottom" data-feedback={feedback.state}>
					<video ref={setVideo} playsInline muted autoPlay aria-label="Barcode camera preview" />
					<div className="pos-camera-heading">
						<SheetTitle>Scan a barcode</SheetTitle>
						{torchAvailable && (
							<Button
								type="button"
								variant="outline"
								className="pos-camera-torch"
								aria-label={torchOn ? "Turn flashlight off" : "Turn flashlight on"}
								title={torchOn ? "Turn flashlight off" : "Turn flashlight on"}
								aria-pressed={torchOn}
								disabled={torchBusy}
								onClick={() => void toggleTorch()}
							>
								<Icon name="flashlight" />
							</Button>
						)}
					</div>
					<div
						className="pos-camera-feedback"
						role={feedback.state === "error" ? "alert" : "status"}
						aria-live="polite"
						aria-busy={scanning}
					>
						{scanning && <span className="pos-camera-spinner" aria-hidden="true" />}
						{feedback.message}
						{torchError && (
							<span role="alert" className="pos-camera-torch-error">
								{torchError}
							</span>
						)}
					</div>
					<div className="pos-camera-guide" aria-hidden="true">
						<span />
						<span />
						<span />
						<span />
						<div className="pos-camera-scanline" />
					</div>
					<SheetDescription className="pos-camera-instructions">
						Center one barcode inside the frame. Keep it level and hold steady.
						<span>Scan different products in turn. Each scan adds one unit.</span>
					</SheetDescription>
					<div className="pos-camera-actions">
						{(feedback.state === "success" || feedback.state === "error") && (
							<Button
								type="button"
								variant="outline"
								disabled={scanning}
								onClick={() => {
									controls.current?.rearm()
									setFeedback({ state: "idle", message: "Ready to scan the same item again" })
								}}
							>
								Scan same item again
							</Button>
						)}
						<Button type="button" variant="outline" disabled={scanning} onClick={() => setCamera(false)}>
							Done
						</Button>
					</div>
				</SheetContent>
			</Sheet>
		</div>
	)
}
