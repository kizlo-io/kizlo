// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { startCamera } from "./ScanInput"

const decoder = vi.hoisted(() => ({ decodeFromConstraints: vi.fn() }))
vi.mock("./barcode-decoder", () => ({ createBarcodeReader: () => decoder }))
afterEach(() => {
	vi.resetAllMocks()
	vi.unstubAllGlobals()
})

it("serializes camera scans, suppresses duplicate frames, and allows explicit repeats", async () => {
	const stop = vi.fn()
	const trackStop = vi.fn()
	const accept = vi.fn(async () => {})
	let capture: (result: { getText: () => string }) => void = () => {}
	vi.stubGlobal(
		"MediaStream",
		class {
			getTracks() {
				return [{ stop: trackStop }]
			}
		},
	)
	const video = document.createElement("video")
	video.srcObject = new MediaStream()
	decoder.decodeFromConstraints.mockImplementation(async (_constraints, _video, callback) => {
		capture = callback
		return { stop }
	})
	const cleanup = await startCamera(video, accept)
	capture({ getText: () => "0012345678905" })
	capture({ getText: () => "0012345678905" })
	expect(accept).toHaveBeenCalledTimes(1)
	expect(accept).toHaveBeenCalledWith("0012345678905")
	capture({ getText: () => "NEXT" })
	expect(accept).toHaveBeenCalledOnce()
	await Promise.resolve()
	capture({ getText: () => "0012345678905" })
	expect(accept).toHaveBeenCalledOnce()
	capture({ getText: () => "NEXT" })
	expect(accept).toHaveBeenCalledTimes(2)
	await Promise.resolve()
	cleanup.rearm()
	capture({ getText: () => "NEXT" })
	expect(accept).toHaveBeenCalledTimes(3)
	expect(decoder.decodeFromConstraints).toHaveBeenCalledWith(
		{ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
		video,
		expect.any(Function),
	)
	cleanup.stop()
	expect(stop).toHaveBeenCalledOnce()
	expect(trackStop).toHaveBeenCalledOnce()
	expect(video.srcObject).toBeNull()
	capture({ getText: () => "AFTER-STOP" })
	expect(accept).toHaveBeenCalledTimes(3)
})
it("propagates permission denial for the manual-input recovery path", async () => {
	decoder.decodeFromConstraints.mockRejectedValue(new DOMException("Denied", "NotAllowedError"))
	await expect(startCamera(document.createElement("video"), vi.fn())).rejects.toMatchObject({ name: "NotAllowedError" })
})
it.each([false, true])("requests continuous focus when supported, tolerating rejection: %s", async (reject) => {
	const applyConstraints = reject ? vi.fn().mockRejectedValue(new Error("Unsupported")) : vi.fn().mockResolvedValue(undefined)
	const track = { getCapabilities: () => ({ focusMode: ["manual", "continuous"] }), applyConstraints }
	const video = document.createElement("video")
	video.srcObject = { getVideoTracks: () => [track] } as unknown as MediaStream
	decoder.decodeFromConstraints.mockResolvedValue({ stop: vi.fn() })
	const cleanup = await startCamera(video, vi.fn())
	expect(applyConstraints).toHaveBeenCalledWith({ advanced: [{ focusMode: "continuous" }] })
	cleanup.stop()
	expect(video.srcObject).toBeNull()
})
it("leaves fixed-focus cameras usable when continuous focus is unavailable", async () => {
	const applyConstraints = vi.fn()
	const video = document.createElement("video")
	video.srcObject = {
		getVideoTracks: () => [{ getCapabilities: () => ({ focusMode: ["manual"] }), applyConstraints }],
	} as unknown as MediaStream
	decoder.decodeFromConstraints.mockResolvedValue({ stop: vi.fn() })
	const cleanup = await startCamera(video, vi.fn())
	expect(applyConstraints).not.toHaveBeenCalled()
	cleanup.stop()
})

it.each([undefined, false, [false], [true], true, [true, false]])(
	"exposes torch control only when it can switch on and off: %j",
	async (torch) => {
		let constraints: MediaTrackConstraints = { width: { ideal: 1920 }, advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }
		let enabled = false
		const applyConstraints = vi.fn(async (next: MediaTrackConstraints) => {
			constraints = next
			enabled = (next.advanced?.at(-1) as MediaTrackConstraintSet & { torch?: boolean })?.torch ?? false
		})
		const track = {
			getCapabilities: () => ({ torch }),
			getConstraints: () => constraints,
			getSettings: () => ({ torch: enabled }),
			applyConstraints,
		}
		const video = document.createElement("video")
		video.srcObject = { getVideoTracks: () => [track] } as unknown as MediaStream
		decoder.decodeFromConstraints.mockResolvedValue({ stop: vi.fn() })
		const reader = await startCamera(video, vi.fn())
		if (torch === true || (Array.isArray(torch) && torch.includes(true) && torch.includes(false))) {
			expect(reader.setTorch).toBeTypeOf("function")
			await reader.setTorch?.(true)
			expect(enabled).toBe(true)
			await reader.setTorch?.(false)
			expect(enabled).toBe(false)
			expect(constraints.width).toEqual({ ideal: 1920 })
			expect(constraints.advanced?.[0]).toMatchObject({ focusMode: "continuous", torch: false })
			reader.stop()
			await expect(reader.setTorch?.(true)).rejects.toThrow("Camera closed")
		} else {
			expect(reader.setTorch).toBeUndefined()
			reader.stop()
		}
	},
)
