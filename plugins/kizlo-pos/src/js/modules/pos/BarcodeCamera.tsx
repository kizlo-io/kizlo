import { LightningIcon } from "@phosphor-icons/react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { apiProblem } from "./api"

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

export function BarcodeCamera({
	onScan,
	open: camera,
	onOpenChange: setCamera,
}: {
	onScan: (code: string) => Promise<void> | Promise<string | undefined>
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	const openingControl = useRef<HTMLElement | null>(null)
	const [error, setError] = useState("")
	const [scanning, setScanning] = useState(false)
	const [torchAvailable, setTorchAvailable] = useState(false)
	const [torchOn, setTorchOn] = useState(false)
	const [torchBusy, setTorchBusy] = useState(false)
	const [torchError, setTorchError] = useState("")
	const torchPending = useRef(false)
	const [feedback, setFeedback] = useState<{ state: "idle" | "loading" | "success" | "error"; message: string }>({
		state: "idle",
		message: "",
	})
	const controls = useRef<Awaited<ReturnType<typeof startCamera>> | null>(null)
	const session = useRef(0)
	const pending = useRef(false)
	const audio = useRef<AudioContext | null>(null)
	const audioReady = useRef<Promise<void> | null>(null)
	const [video, setVideo] = useState<HTMLVideoElement | null>(null)
	const [previewReady, setPreviewReady] = useState(false)
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
		if (!camera) return
		enableSound()
		setError("")
		setFeedback({ state: "idle", message: "" })
		setTorchOn(false)
		setTorchError("")
	}, [camera])
	const submit = async (value: string) => {
		if (!value || pending.current) return
		window.dispatchEvent(new Event("kizlo-pos-activity"))
		const token = session.current
		void beep()
		setFeedback({ state: "loading", message: "Checking and adding product…" })
		pending.current = true
		setError("")
		setScanning(true)
		try {
			const message = await scanRef.current(value)
			if (session.current !== token) return
			setFeedback({ state: "success", message: message || "Product added to sale" })
		} catch (failure) {
			if (session.current !== token) return
			const message = apiProblem(failure).message
			setError(message)
			setFeedback({ state: "error", message })
			void beep(true)
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
		if (!camera || !video) return
		let active = true
		let playing = false
		let settle: ReturnType<typeof setTimeout> | undefined
		let videoFrame: number | undefined
		let paintFrame: number | undefined
		const cancelReveal = () => {
			clearTimeout(settle)
			settle = undefined
			if (videoFrame !== undefined) video.cancelVideoFrameCallback(videoFrame)
			if (paintFrame !== undefined) cancelAnimationFrame(paintFrame)
			videoFrame = undefined
			paintFrame = undefined
		}
		const reveal = () => {
			if (active) setPreviewReady(true)
		}
		const nextFrame = () => {
			if (!playing) return
			cancelReveal()
			if (typeof video.requestVideoFrameCallback === "function") videoFrame = video.requestVideoFrameCallback(reveal)
			else
				paintFrame = requestAnimationFrame(() => {
					paintFrame = requestAnimationFrame(reveal)
				})
		}
		const play = () => {
			playing = true
			if (settle === undefined) nextFrame()
		}
		const resize = () => {
			cancelReveal()
			setPreviewReady(false)
			// Rotation updates the viewport and camera dimensions separately; wait for both to settle.
			settle = setTimeout(() => {
				settle = undefined
				nextFrame()
			}, 200)
		}
		video.addEventListener("playing", play)
		video.addEventListener("resize", resize)
		window.addEventListener("resize", resize)
		window.addEventListener("orientationchange", resize)
		window.visualViewport?.addEventListener("resize", resize)
		screen.orientation?.addEventListener("change", resize)
		return () => {
			active = false
			cancelReveal()
			video.removeEventListener("playing", play)
			video.removeEventListener("resize", resize)
			window.removeEventListener("resize", resize)
			window.removeEventListener("orientationchange", resize)
			window.visualViewport?.removeEventListener("resize", resize)
			screen.orientation?.removeEventListener("change", resize)
		}
	}, [camera, video])
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
			await submitRef.current(value)
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
					setError("Camera unavailable or permission denied. Search by barcode or SKU in the main search bar instead.")
					setCamera(false)
				}
			})
		return () => {
			cancelled = true
			session.current++
			controls.current = null
			setTorchAvailable(false)
			setPreviewReady(false)
			stop?.()
			document.removeEventListener("visibilitychange", hide)
		}
	}, [camera, video, setCamera])
	return (
		<div className="pos-scan [&>p]:mt-5">
			{error && !camera && <p role="alert">{error}</p>}
			<Sheet open={camera} onOpenChange={setCamera}>
				<SheetContent
					container={host}
					className={cn(
						"pos-camera inset-0 size-full max-h-none max-w-none overflow-hidden rounded-none border-0 bg-black p-0 text-white [--scan-color:#fff]",
						"data-[state=closed]:animate-camera-out data-[state=open]:animate-camera-in motion-reduce:data-[state]:animate-none data-[feedback=error]:[--scan-color:#fb7185]",
						"data-[feedback=loading]:[--scan-color:#facc15] data-[feedback=success]:[--scan-color:#4ade80] [&>button:focus-visible]:text-yellow-400",
						"[&>button:focus]:shadow-none [&>button:focus]:outline-none! [&>button]:top-[calc(env(safe-area-inset-top,0px)+12px)]",
						"[&>button]:right-[calc(env(safe-area-inset-right,0px)+12px)] [&>button]:z-3 [&>button]:rounded-full [&>button]:bg-black/75 [&>button]:text-white",
						"[&>button]:opacity-100 [&_video]:absolute [&_video]:inset-0 [&_video]:block [&_video]:size-full [&_video]:max-h-none [&_video]:max-w-none [&_video]:object-cover",
						"[&_video]:opacity-0 data-[preview-ready=true]:[&_video]:opacity-100",
					)}
					side="bottom"
					data-feedback={feedback.state}
					data-preview-ready={previewReady}
					onOpenAutoFocus={() => {
						openingControl.current = document.activeElement as HTMLElement | null
					}}
					onCloseAutoFocus={(event) => {
						event.preventDefault()
						openingControl.current?.focus()
					}}
				>
					<video ref={setVideo} playsInline muted autoPlay aria-label="Barcode camera preview" />
					<div className="pos-camera-heading pointer-events-none absolute top-[calc(env(safe-area-inset-top,0px)+12px)] right-19 left-[calc(env(safe-area-inset-left,0px)+12px)] z-2 flex items-center justify-between gap-3">
						<SheetTitle className="sr-only">Scan a barcode</SheetTitle>
						{torchAvailable && (
							<Button
								type="button"
								variant="outline"
								className="pos-camera-torch pointer-events-auto size-11 shrink-0 rounded-full border-transparent bg-black/75 p-0 text-white aria-pressed:border-current aria-pressed:text-yellow-400"
								aria-label={torchOn ? "Turn flashlight off" : "Turn flashlight on"}
								title={torchOn ? "Turn flashlight off" : "Turn flashlight on"}
								aria-pressed={torchOn}
								disabled={torchBusy}
								onClick={() => void toggleTorch()}
							>
								<LightningIcon size={22} weight={torchOn ? "fill" : "regular"} aria-hidden="true" />
							</Button>
						)}
					</div>
					<div
						className={cn(
							"pos-camera-guide -translate-1/2 pointer-events-none absolute top-1/2 left-1/2 z-1 h-[clamp(120px,24dvh,240px)] w-[min(calc(100%-48px),640px)] rounded-[14px]",
							"border border-white/35 shadow-[0_0_0_100vmax_rgb(0_0_0/55%)] [&>span:nth-child(1)]:-top-0.5 [&>span:nth-child(1)]:-left-0.5",
							"[&>span:nth-child(1)]:rounded-tl-[14px] [&>span:nth-child(1)]:border-r-0 [&>span:nth-child(1)]:border-b-0 [&>span:nth-child(2)]:-top-0.5",
							"[&>span:nth-child(2)]:-right-0.5 [&>span:nth-child(2)]:rounded-tr-[14px] [&>span:nth-child(2)]:border-b-0 [&>span:nth-child(2)]:border-l-0",
							"[&>span:nth-child(3)]:-bottom-0.5 [&>span:nth-child(3)]:-left-0.5 [&>span:nth-child(3)]:rounded-bl-[14px] [&>span:nth-child(3)]:border-t-0",
							"[&>span:nth-child(3)]:border-r-0 [&>span:nth-child(4)]:-right-0.5 [&>span:nth-child(4)]:-bottom-0.5 [&>span:nth-child(4)]:rounded-br-[14px]",
							"[&>span:nth-child(4)]:border-t-0 [&>span:nth-child(4)]:border-l-0 [&>span]:absolute [&>span]:size-7 [&>span]:border-(--scan-color) [&>span]:border-3",
							"[&>span]:drop-shadow-[0_0_7px_var(--scan-color)]",
						)}
						aria-hidden="true"
					>
						<span />
						<span />
						<span />
						<span />
						<div className="pos-camera-scanline absolute inset-x-3 top-1/2 h-px animate-camera-line bg-(--scan-color) shadow-[0_0_8px_var(--scan-color)] motion-reduce:animate-none" />
					</div>
					<SheetDescription className="sr-only">Center one barcode inside the frame. Keep it level and hold steady.</SheetDescription>
					<div className="pos-camera-actions absolute right-[calc(env(safe-area-inset-right,0px)+20px)] bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] left-[calc(env(safe-area-inset-left,0px)+20px)] z-2 flex flex-col gap-3 [&_button]:min-h-13 [&_button]:w-full [&_button]:border-white [&_button]:bg-black/75 [&_button]:text-base/normal [&_button]:text-white">
						{(feedback.state !== "idle" || torchError) && (
							<div
								className="pos-camera-feedback rounded-xl bg-black/75 p-3 text-center text-(--scan-color) [@media(max-height:450px)]:px-3 [@media(max-height:450px)]:py-1.5"
								role={feedback.state === "error" ? "alert" : "status"}
								aria-live="polite"
								aria-busy={scanning}
							>
								{scanning && <Spinner className="pos-camera-spinner mr-2 inline-block size-4 align-middle" aria-hidden="true" />}
								{feedback.message}
								{torchError && (
									<span role="alert" className="pos-camera-torch-error mt-2 block text-white">
										{torchError}
									</span>
								)}
							</div>
						)}
						{(feedback.state === "success" || feedback.state === "error") && (
							<Button
								type="button"
								variant="outline"
								disabled={scanning}
								onClick={() => {
									controls.current?.rearm()
									setFeedback({ state: "idle", message: "" })
								}}
							>
								Scan same item again
							</Button>
						)}
						<Button
							type="button"
							className="pos-camera-done rounded-xl border-0! bg-primary! font-semibold"
							disabled={scanning}
							onClick={() => setCamera(false)}
						>
							Done
						</Button>
					</div>
				</SheetContent>
			</Sheet>
		</div>
	)
}
