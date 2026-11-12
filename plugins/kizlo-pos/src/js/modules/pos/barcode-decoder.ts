import { BrowserMultiFormatOneDReader } from "@zxing/browser"
import { BarcodeFormat, DecodeHintType } from "@zxing/library"

export const barcodeHints = new Map([
	[
		DecodeHintType.POSSIBLE_FORMATS,
		[BarcodeFormat.EAN_13, BarcodeFormat.UPC_A, BarcodeFormat.EAN_8, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39],
	],
])

type Bounds = Pick<DOMRectReadOnly, "left" | "top" | "width" | "height">

// Map the visible guide through object-fit: cover back to original camera pixels.
export function cameraCrop(width: number, height: number, preview: Bounds, guide: Bounds) {
	if (![width, height, preview.width, preview.height, guide.width, guide.height].every((value) => Number.isFinite(value) && value > 0))
		return null
	const scale = Math.max(preview.width / width, preview.height / height)
	const offsetX = (width * scale - preview.width) / 2
	const offsetY = (height * scale - preview.height) / 2
	const left = (guide.left - preview.left + offsetX) / scale
	const top = (guide.top - preview.top + offsetY) / scale
	const x = Math.max(0, Math.floor(left))
	const y = Math.max(0, Math.floor(top))
	const right = Math.min(width, Math.ceil(left + guide.width / scale))
	const bottom = Math.min(height, Math.ceil(top + guide.height / scale))
	return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}

class GuidedBarcodeReader extends BrowserMultiFormatOneDReader {
	private video?: HTMLVideoElement
	private crop?: HTMLCanvasElement

	constructor(video?: HTMLVideoElement) {
		super(barcodeHints, { delayBetweenScanAttempts: 100, delayBetweenScanSuccess: 100 })
		this.video = video
	}

	decodeFromCanvas(source: HTMLCanvasElement) {
		const guide = this.video?.closest(".pos-camera")?.querySelector(".pos-camera-guide")
		const region =
			this.video && guide
				? cameraCrop(source.width, source.height, this.video.getBoundingClientRect(), guide.getBoundingClientRect())
				: null
		if (!region) return super.decodeFromCanvas(source)
		this.crop ??= document.createElement("canvas")
		if (this.crop.width !== region.width) this.crop.width = region.width
		if (this.crop.height !== region.height) this.crop.height = region.height
		let context: CanvasRenderingContext2D | null
		try {
			context = this.crop.getContext("2d", { willReadFrequently: true })
		} catch {
			context = this.crop.getContext("2d")
		}
		if (!context) return super.decodeFromCanvas(source)
		context.drawImage(source, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height)
		return super.decodeFromCanvas(this.crop)
	}
}

export const createBarcodeReader = (video?: HTMLVideoElement) => new GuidedBarcodeReader(video)
