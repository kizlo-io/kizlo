// @vitest-environment jsdom

import { BrowserCodeReader } from "@zxing/browser"
import {
	BarcodeFormat,
	BinaryBitmap,
	HybridBinarizer,
	MultiFormatOneDReader,
	MultiFormatReader,
	NotFoundException,
	Result,
	RGBLuminanceSource,
} from "@zxing/library"
import { expect, it, vi } from "vitest"
import { barcodeHints, cameraCrop, createBarcodeReader } from "./barcode-decoder"
import fixtures from "./barcode-fixtures.json"

// Encoded with the existing PHP label encoder, independently of the browser decoder.
it.each(fixtures)("decodes the printed $format fixture", ({ row, value }) => {
	const height = 120
	const pixels = new Uint8ClampedArray(row.length * height)
	for (let y = 0; y < height; y++) for (let x = 0; x < row.length; x++) pixels[y * row.length + x] = row[x] === "1" ? 0 : 255
	const image = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, row.length, height)))
	expect(new MultiFormatReader().decode(image, barcodeHints).getText()).toBe(value)
})

it("maps a portrait cover preview and its guide back to native camera pixels", () => {
	expect(cameraCrop(1920, 1080, new DOMRect(20, 50, 360, 540), new DOMRect(50, 230, 300, 180))).toEqual({
		x: 660,
		y: 360,
		width: 600,
		height: 360,
	})
	expect(cameraCrop(1080, 1920, new DOMRect(0, 0, 540, 360), new DOMRect(90, 30, 360, 300))).toEqual({
		x: 180,
		y: 660,
		width: 720,
		height: 600,
	})
	expect(cameraCrop(200, 100, new DOMRect(0, 0, 200, 100), new DOMRect(-20, -20, 80, 60))).toEqual({ x: 0, y: 0, width: 60, height: 40 })
	expect(cameraCrop(1920, 1080, new DOMRect(), new DOMRect())).toBeNull()
})

it.each(fixtures)("reads a small $format label that whole-frame row sampling misses", ({ row, value }) => {
	const width = 1920
	const height = 1080
	const pixels = new Uint8ClampedArray(width * height).fill(255)
	const left = Math.floor((width - row.length) / 2)
	for (let y = 518; y < 530; y++) for (let x = 0; x < row.length; x++) pixels[y * width + left + x] = row[x] === "1" ? 0 : 255
	const full = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, width, height)))
	expect(() => new MultiFormatOneDReader(barcodeHints).decode(full, barcodeHints)).toThrow()
	const region = cameraCrop(width, height, new DOMRect(0, 0, 960, 540), new DOMRect(160, 205, 640, 130))
	if (!region) throw new Error("Missing guide region")
	const cropped = new Uint8ClampedArray(region.width * region.height)
	for (let y = 0; y < region.height; y++)
		cropped.set(pixels.subarray((region.y + y) * width + region.x, (region.y + y) * width + region.x + region.width), y * region.width)
	const image = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(cropped, region.width, region.height)))
	expect(new MultiFormatOneDReader(barcodeHints).decode(image, barcodeHints).getText()).toBe(value)
})

it.each([false, true])("decodes native guide pixels with legacy canvas options: %s", (legacyOptions) => {
	const dialog = document.createElement("div")
	dialog.className = "pos-camera"
	const video = document.createElement("video")
	const guide = document.createElement("div")
	guide.className = "pos-camera-guide"
	dialog.append(video, guide)
	vi.spyOn(video, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 960, 540))
	vi.spyOn(guide, "getBoundingClientRect").mockReturnValue(new DOMRect(160, 205, 640, 130))
	const source = document.createElement("canvas")
	source.width = 1920
	source.height = 1080
	const drawImage = vi.fn()
	const context = vi.spyOn(HTMLCanvasElement.prototype, "getContext")
	context.mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
	if (legacyOptions)
		context.mockImplementationOnce(() => {
			throw new TypeError("Unsupported canvas options")
		})
	const decoded = new Result("0012345678905", new Uint8Array(), 0, [], BarcodeFormat.EAN_13)
	const decode = vi.spyOn(BrowserCodeReader.prototype, "decodeFromCanvas").mockReturnValue(decoded)
	try {
		expect(createBarcodeReader(video).decodeFromCanvas(source)).toBe(decoded)
		const crop = decode.mock.calls[0]?.[0]
		expect(crop).not.toBe(source)
		expect([crop?.width, crop?.height]).toEqual([1280, 260])
		expect(drawImage).toHaveBeenCalledWith(source, 320, 410, 1280, 260, 0, 0, 1280, 260)
	} finally {
		vi.restoreAllMocks()
	}
})

it("catches a briefly readable frame between the old half-second retry intervals and cancels retries on stop", () => {
	vi.useFakeTimers()
	const reader = createBarcodeReader()
	const capture = vi.fn()
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
	const started = Date.now()
	const decode = vi.spyOn(reader, "decodeFromCanvas").mockImplementation(() => {
		const elapsed = Date.now() - started
		if (elapsed >= 250 && elapsed < 450) return new Result("0012345678905", new Uint8Array(), 0, [], BarcodeFormat.EAN_13)
		throw new NotFoundException()
	})
	const controls = reader.scan(document.createElement("video"), (result) => {
		if (result) capture(result.getText())
	})
	try {
		vi.advanceTimersByTime(450)
		expect(capture).toHaveBeenCalledTimes(2)
		expect(capture).toHaveBeenCalledWith("0012345678905")
		controls.stop()
		const attempts = decode.mock.calls.length
		vi.advanceTimersByTime(1000)
		expect(decode).toHaveBeenCalledTimes(attempts)
	} finally {
		controls.stop()
		vi.restoreAllMocks()
		vi.useRealTimers()
	}
})
