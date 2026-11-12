// @vitest-environment jsdom
import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { BarcodeCamera } from "./BarcodeCamera"

const decoder = vi.hoisted(() => ({ decodeFromConstraints: vi.fn() }))
vi.mock("./barcode-decoder", () => ({ createBarcodeReader: () => decoder }))

let root: Root
let host: HTMLDivElement
let captureCode: (result: { getText: () => string }) => void
beforeEach(() => {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
	vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
	decoder.decodeFromConstraints.mockImplementation(async (_constraints, _video, callback) => {
		captureCode = callback
		return { stop: vi.fn() }
	})
	host = document.createElement("div")
	host.className = "kizlo-pos-app"
	document.body.append(host)
	root = createRoot(host)
})
afterEach(async () => {
	await act(async () => root.unmount())
	vi.useRealTimers()
	host.remove()
	vi.resetAllMocks()
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})
function CameraHarness({ onScan }: { onScan: (code: string) => Promise<void> }) {
	const [open, setOpen] = useState(false)
	return (
		<>
			<button type="button" onClick={() => setOpen(true)}>
				Open camera
			</button>
			<BarcodeCamera open={open} onOpenChange={setOpen} onScan={onScan} />
		</>
	)
}
async function openCamera(onScan: (code: string) => Promise<void> = vi.fn()) {
	await act(async () => root.render(<CameraHarness onScan={onScan} />))
	await act(async () => {
		const trigger = host.querySelector<HTMLButtonElement>("button")
		trigger?.focus()
		trigger?.click()
	})
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0))
	})
}
it("starts the camera after the real modal portal mounts its video, then stops on close", async () => {
	const stop = vi.fn()
	decoder.decodeFromConstraints.mockResolvedValue({ stop })
	await openCamera()
	const video = host.querySelector("video")
	expect(video).toBeInstanceOf(HTMLVideoElement)
	expect(decoder.decodeFromConstraints).toHaveBeenCalledOnce()
	expect(decoder.decodeFromConstraints).toHaveBeenCalledWith(expect.any(Object), video, expect.any(Function))
	expect(video?.playsInline).toBe(true)
	expect(video?.muted).toBe(true)
	expect(host.querySelector(".pos-camera-torch")).toBeNull()
	expect(host.querySelector(".pos-camera-guide")?.getAttribute("aria-hidden")).toBe("true")
	expect(host.querySelector(".pos-camera-feedback")).toBeNull()
	expect(host.textContent).not.toContain("Ready for the next product")
	expect(host.querySelector(".pos-camera-heading h2")?.classList.contains("sr-only")).toBe(true)
	const description = document.getElementById(host.querySelector('[role="dialog"]')?.getAttribute("aria-describedby") ?? "")
	expect(description?.classList.contains("sr-only")).toBe(true)
	expect(host.querySelector(".pos-camera-instructions")).toBeNull()
	expect(host.querySelector(".pos-camera-done")?.textContent).toBe("Done")
	await act(async () => host.querySelector<HTMLButtonElement>('[role="dialog"] button')?.click())
	expect(stop).toHaveBeenCalledOnce()
	expect(document.activeElement?.textContent).toBe("Open camera")
})

function cameraFrames(video: HTMLVideoElement) {
	let id = 0
	const callbacks = new Map<number, VideoFrameRequestCallback>()
	const request = vi.fn((callback: VideoFrameRequestCallback) => {
		callbacks.set(++id, callback)
		return id
	})
	const cancel = vi.fn((frame: number) => callbacks.delete(frame))
	Object.assign(video, { requestVideoFrameCallback: request, cancelVideoFrameCallback: cancel })
	return {
		request,
		cancel,
		present: () =>
			act(async () => {
				const pending = [...callbacks.values()]
				callbacks.clear()
				for (const callback of pending) callback(0, {} as VideoFrameCallbackMetadata)
			}),
	}
}
it("reveals the preview only after a playing frame and resets it when reopened", async () => {
	await openCamera()
	const video = host.querySelector("video") as HTMLVideoElement
	const frames = cameraFrames(video)
	expect(host.querySelector(".pos-camera")?.getAttribute("data-preview-ready")).toBe("false")
	expect(host.querySelector('[aria-label="Starting camera"]')).toBeNull()
	await act(async () => video.dispatchEvent(new Event("loadedmetadata")))
	expect(frames.request).not.toHaveBeenCalled()
	await act(async () => video.dispatchEvent(new Event("playing")))
	expect(host.querySelector(".pos-camera")?.getAttribute("data-preview-ready")).toBe("false")
	await frames.present()
	expect(host.querySelector(".pos-camera")?.getAttribute("data-preview-ready")).toBe("true")
	await act(async () => host.querySelector<HTMLButtonElement>(".pos-camera-done")?.click())
	await act(async () => host.querySelector<HTMLButtonElement>("button")?.click())
	expect(host.querySelector(".pos-camera")?.getAttribute("data-preview-ready")).toBe("false")
	expect(host.querySelector('[aria-label="Starting camera"]')).toBeNull()
})
it("keeps rotation black until viewport and video resizing settle, without reopening the camera", async () => {
	const visualViewport = new EventTarget()
	vi.stubGlobal("visualViewport", visualViewport)
	await openCamera()
	vi.useFakeTimers()
	const video = host.querySelector("video") as HTMLVideoElement
	const frames = cameraFrames(video)
	await act(async () => video.dispatchEvent(new Event("playing")))
	await frames.present()
	for (const direction of ["landscape", "portrait"]) {
		await act(async () => window.dispatchEvent(new Event("orientationchange")))
		expect(host.querySelector(".pos-camera")?.getAttribute("data-preview-ready"), direction).toBe("false")
		await act(async () => vi.advanceTimersByTime(150))
		await act(async () => {
			window.dispatchEvent(new Event("resize"))
			visualViewport.dispatchEvent(new Event("resize"))
			video.dispatchEvent(new Event("resize"))
			video.dispatchEvent(new Event("playing"))
		})
		await act(async () => vi.advanceTimersByTime(199))
		await frames.present()
		expect(host.querySelector(".pos-camera")?.getAttribute("data-preview-ready")).toBe("false")
		await act(async () => vi.advanceTimersByTime(1))
		expect(host.querySelector(".pos-camera")?.getAttribute("data-preview-ready")).toBe("false")
		await frames.present()
		expect(host.querySelector(".pos-camera")?.getAttribute("data-preview-ready")).toBe("true")
	}
	expect(host.querySelector("video")).toBe(video)
	expect(decoder.decodeFromConstraints).toHaveBeenCalledOnce()
	expect(host.querySelector('[aria-label="Starting camera"]')).toBeNull()
	await act(async () => window.dispatchEvent(new Event("resize")))
	await act(async () => vi.advanceTimersByTime(200))
	await act(async () => host.querySelector<HTMLButtonElement>(".pos-camera-done")?.click())
	expect(frames.cancel).toHaveBeenCalled()
	await frames.present()
	expect(host.querySelector('[role="dialog"]')).toBeNull()
})
it("waits for two paints on older browsers without video frame callbacks", async () => {
	await openCamera()
	const callbacks: FrameRequestCallback[] = []
	vi.stubGlobal(
		"requestAnimationFrame",
		vi.fn((callback: FrameRequestCallback) => callbacks.push(callback)),
	)
	vi.stubGlobal("cancelAnimationFrame", vi.fn())
	await act(async () => host.querySelector("video")?.dispatchEvent(new Event("playing")))
	expect(host.querySelector(".pos-camera")?.getAttribute("data-preview-ready")).toBe("false")
	await act(async () => callbacks.shift()?.(0))
	expect(host.querySelector(".pos-camera")?.getAttribute("data-preview-ready")).toBe("false")
	await act(async () => callbacks.shift()?.(16))
	expect(host.querySelector(".pos-camera")?.getAttribute("data-preview-ready")).toBe("true")
})

function audioFixture() {
	const oscillator = {
		type: "sine" as OscillatorType,
		frequency: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
		connect: vi.fn(),
		disconnect: vi.fn(),
		start: vi.fn(),
		stop: vi.fn(),
		onended: null as (() => void) | null,
	}
	const gain = {
		gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
		connect: vi.fn(),
		disconnect: vi.fn(),
	}
	const resume = vi.fn().mockResolvedValue(undefined)
	const close = vi.fn().mockResolvedValue(undefined)
	vi.stubGlobal(
		"AudioContext",
		class {
			state = "running"
			currentTime = 10
			destination = {}
			resume = resume
			close = close
			createOscillator() {
				return oscillator
			}
			createGain() {
				return gain
			}
		},
	)
	return { oscillator, gain, resume, close }
}
async function submitCode() {
	await act(async () => captureCode({ getText: () => "0012345678905" }))
}
it("unlocks sound on opening and releases audio on unmount", async () => {
	const sound = audioFixture()
	await openCamera()
	await submitCode()
	expect(sound.resume).toHaveBeenCalledOnce()
	expect(sound.oscillator.start).toHaveBeenCalledOnce()
	sound.oscillator.onended?.()
	expect(sound.oscillator.disconnect).toHaveBeenCalledOnce()
	expect(sound.gain.disconnect).toHaveBeenCalledOnce()
	await act(async () => root.render(null))
	expect(sound.close).toHaveBeenCalledOnce()
})
it.each([false, true])("beeps at camera capture before product lookup completes, even if lookup fails: %s", async (fails) => {
	const sound = audioFixture()
	let capture: (result: { getText: () => string }) => void = () => {}
	decoder.decodeFromConstraints.mockImplementation(async (_constraints, _video, callback) => {
		capture = callback
		return { stop: vi.fn() }
	})
	let finish: () => void = () => {}
	const scan = vi.fn(
		() =>
			new Promise<void>((resolve, reject) => {
				finish = fails ? () => reject(new Error("No matching product")) : resolve
			}),
	)
	await openCamera(scan)
	expect(sound.resume).toHaveBeenCalledOnce()
	await act(async () => {
		capture({ getText: () => "0012345678905" })
		capture({ getText: () => "0012345678905" })
	})
	expect(scan).toHaveBeenCalledOnce()
	expect(sound.oscillator.start).toHaveBeenCalledOnce()
	expect(host.querySelector('[role="dialog"]')).not.toBeNull()
	expect(host.querySelector(".pos-camera")?.getAttribute("data-feedback")).toBe("loading")
	expect(host.querySelector(".pos-camera-spinner")).not.toBeNull()
	await act(async () => finish())
	expect(sound.oscillator.start).toHaveBeenCalledTimes(fails ? 2 : 1)
	expect(host.querySelector(".pos-camera")?.getAttribute("data-feedback")).toBe(fails ? "error" : "success")
	expect(host.querySelector(".pos-camera-spinner")).toBeNull()
	if (fails) {
		expect(sound.oscillator.type).toBe("sine")
		expect(sound.oscillator.frequency.setValueAtTime.mock.calls.slice(-2)).toEqual([
			[660, 10],
			[440, 10.115],
		])
		expect(sound.oscillator.frequency.linearRampToValueAtTime).not.toHaveBeenCalled()
		expect(sound.gain.gain.setValueAtTime).toHaveBeenCalledWith(0.0001, 10.115)
		expect(sound.oscillator.stop).toHaveBeenLastCalledWith(10.22)
	}
	await act(async () => capture({ getText: () => "0012345678905" }))
	expect(scan).toHaveBeenCalledOnce()
	const repeat = [...host.querySelectorAll("button")].find((button) => button.textContent === "Scan same item again")
	await act(async () => repeat?.click())
	await act(async () => capture({ getText: () => "0012345678905" }))
	expect(scan).toHaveBeenCalledTimes(2)
})
it("keeps successful scanning usable when the browser blocks audio", async () => {
	vi.stubGlobal(
		"AudioContext",
		class {
			constructor() {
				throw new DOMException("Blocked", "NotAllowedError")
			}
		},
	)
	const scan = vi.fn(async () => {})
	await openCamera(scan)
	await submitCode()
	expect(scan).toHaveBeenCalledOnce()
	expect(host.querySelector('[role="alert"]')).toBeNull()
	expect(host.querySelector("input")).toBeNull()
})
it.each([false, true])("does not block a scan while audio starts, respecting unmount: %s", async (unmount) => {
	const sound = audioFixture()
	let ready: () => void = () => {}
	sound.resume.mockReturnValue(
		new Promise<void>((resolve) => {
			ready = resolve
		}),
	)
	await openCamera(vi.fn(async () => {}))
	await submitCode()
	expect(host.querySelector("input")).toBeNull()
	expect(sound.oscillator.start).not.toHaveBeenCalled()
	if (unmount) await act(async () => root.render(null))
	await act(async () => ready())
	expect(sound.oscillator.start).toHaveBeenCalledTimes(unmount ? 0 : 1)
})
it("opens the camera directly on desktop without a separate code entry form", async () => {
	await openCamera()
	expect(host.querySelector("video")).not.toBeNull()
	expect(host.querySelector("input, form")).toBeNull()
	expect(host.textContent).not.toContain("Use camera")
})
it("stops the camera when the page becomes hidden", async () => {
	const stop = vi.fn()
	decoder.decodeFromConstraints.mockResolvedValue({ stop })
	await openCamera()
	vi.spyOn(document, "hidden", "get").mockReturnValue(true)
	await act(async () => document.dispatchEvent(new Event("visibilitychange")))
	expect(stop).toHaveBeenCalledOnce()
	expect(host.querySelector('[role="dialog"]')).toBeNull()
})
it("shows a recoverable error when camera permission is denied", async () => {
	decoder.decodeFromConstraints.mockRejectedValue(new DOMException("Denied", "NotAllowedError"))
	await openCamera()
	expect(host.querySelector('[role="alert"]')?.textContent).toContain("Camera unavailable or permission denied")
	expect(host.querySelector('[role="dialog"]')).toBeNull()
	expect(host.querySelector("input")).toBeNull()
	expect(host.querySelector('[role="alert"]')?.textContent).toContain("main search bar")
})
it("stops a late camera startup when the modal was already closed", async () => {
	const stop = vi.fn()
	let finish: (controls: { stop: () => void }) => void = () => {}
	decoder.decodeFromConstraints.mockReturnValue(
		new Promise((resolve) => {
			finish = resolve
		}),
	)
	await openCamera()
	expect(decoder.decodeFromConstraints).toHaveBeenCalledOnce()
	await act(async () => host.querySelector<HTMLButtonElement>('[role="dialog"] button')?.click())
	await act(async () => finish({ stop }))
	expect(stop).toHaveBeenCalledOnce()
})

it("ignores late feedback and error audio after the user closes a pending camera scan", async () => {
	const sound = audioFixture()
	let capture: (result: { getText: () => string }) => void = () => {}
	decoder.decodeFromConstraints.mockImplementation(async (_constraints, _video, callback) => {
		capture = callback
		return { stop: vi.fn() }
	})
	let fail: (error: Error) => void = () => {}
	await openCamera(
		() =>
			new Promise<void>((_resolve, reject) => {
				fail = reject
			}),
	)
	await act(async () => capture({ getText: () => "MISSING" }))
	await act(async () => host.querySelector<HTMLButtonElement>('[role="dialog"] > button')?.click())
	await act(async () => fail(new Error("No matching product")))
	expect(host.querySelector('[role="dialog"]')).toBeNull()
	expect(host.querySelector('[role="alert"]')).toBeNull()
	expect(sound.oscillator.start).toHaveBeenCalledOnce()
})

function torchFixture() {
	let enabled = false
	const stop = vi.fn()
	const applyConstraints = vi.fn(async (constraints: MediaTrackConstraints) => {
		enabled = (constraints.advanced?.at(-1) as MediaTrackConstraintSet & { torch?: boolean })?.torch ?? false
	})
	const track = {
		getCapabilities: () => ({ torch: true }),
		getConstraints: () => ({}),
		getSettings: () => ({ torch: enabled }),
		applyConstraints,
		stop,
	}
	vi.stubGlobal(
		"MediaStream",
		class {
			getVideoTracks() {
				return [track]
			}
			getTracks() {
				return [track]
			}
		},
	)
	let capture: (result: { getText: () => string }) => void = () => {}
	decoder.decodeFromConstraints.mockImplementation(async (_constraints, video, callback) => {
		video.srcObject = new MediaStream()
		capture = callback
		return { stop: vi.fn() }
	})
	return { track, capture: (code: string) => capture({ getText: () => code }) }
}
it.each(["success", "rejection", "ignored"])("toggles the flashlight without breaking scans: %s", async (outcome) => {
	const fixture = torchFixture()
	const scan = vi.fn(async () => {})
	await openCamera(scan)
	const button = host.querySelector<HTMLButtonElement>(".pos-camera-torch")
	expect(button?.getAttribute("aria-pressed")).toBe("false")
	expect(button?.closest(".pos-camera-heading")).not.toBeNull()
	if (outcome === "rejection") fixture.track.applyConstraints.mockRejectedValueOnce(new Error("Unavailable"))
	if (outcome === "ignored") fixture.track.applyConstraints.mockResolvedValueOnce(undefined)
	await act(async () => button?.click())
	expect(button?.getAttribute("aria-pressed")).toBe(outcome === "success" ? "true" : "false")
	if (outcome === "success") {
		expect(button?.getAttribute("aria-label")).toBe("Turn flashlight off")
		await act(async () => button?.click())
		expect(button?.getAttribute("aria-pressed")).toBe("false")
	} else expect(host.querySelector(".pos-camera-torch-error")?.textContent).toContain("Flashlight could not be changed")
	await act(async () => fixture.capture("CANVAS"))
	expect(scan).toHaveBeenCalledOnce()
	expect(host.querySelector(".pos-camera")?.getAttribute("data-feedback")).toBe("success")
	await act(async () => host.querySelector<HTMLButtonElement>('[role="dialog"] > button')?.click())
	expect(fixture.track.stop).toHaveBeenCalledOnce()
})
it("serializes flashlight requests and ignores a late failure after closing", async () => {
	const fixture = torchFixture()
	let fail: (error: Error) => void = () => {}
	fixture.track.applyConstraints.mockReturnValueOnce(
		new Promise((_resolve, reject) => {
			fail = reject
		}),
	)
	await openCamera()
	const button = host.querySelector<HTMLButtonElement>(".pos-camera-torch")
	await act(async () => {
		button?.click()
		button?.click()
	})
	expect(fixture.track.applyConstraints).toHaveBeenCalledOnce()
	expect(button?.disabled).toBe(true)
	await act(async () => host.querySelector<HTMLButtonElement>('[role="dialog"] > button')?.click())
	await act(async () => fail(new Error("Stopped")))
	expect(host.querySelector('[role="alert"]')).toBeNull()
	expect(fixture.track.stop).toHaveBeenCalledOnce()
})
