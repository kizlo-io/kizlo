import type { Product } from "./products-api"

export function publicLink(value: string | null): string | null {
	try {
		const url = new URL(value ?? "")
		const privatePath = /(?:^|\/)(?:wp-admin|wp-json|wp-login\.php)(?:\/|$)/i.test(decodeURIComponent(url.pathname))
		const privateQuery = [...url.searchParams.keys()].some((key) =>
			/^(?:_?wpnonce|nonce|preview(?:_id|_nonce)?|password|(?:access_)?token|rest_route)$/i.test(key),
		)
		if (!/^https?:$/.test(url.protocol) || url.username || url.password || privatePath || privateQuery) return null
		return url.href
	} catch {
		return null
	}
}

export async function prepareImage(url: string, signal: AbortSignal): Promise<File | null> {
	const controller = new AbortController()
	const cancel = () => controller.abort()
	signal.addEventListener("abort", cancel, { once: true })
	if (signal.aborted) controller.abort()
	const timeout = setTimeout(cancel, 10000)
	try {
		if (signal.aborted || !/^https?:$/.test(new URL(url).protocol)) return null
		const response = await fetch(url, { credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal })
		const type = response.headers.get("Content-Type")?.split(";")[0]?.trim() ?? ""
		if (!response.ok || !["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(type)) return null
		const limit = 5 * 1024 * 1024
		if (Number(response.headers.get("Content-Length")) > limit) return null
		const reader = response.body?.getReader()
		if (!reader) return null
		const chunks: BlobPart[] = []
		let size = 0
		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				size += value.byteLength
				if (size > limit) return null
				chunks.push(new Uint8Array(value).buffer)
			}
		} finally {
			await reader.cancel()
		}
		if (!size || controller.signal.aborted) return null
		const extension = type === "image/jpeg" ? "jpg" : type.slice(6)
		return new File(chunks, `product.${extension}`, { type })
	} catch {
		return null
	} finally {
		controller.abort()
		clearTimeout(timeout)
		signal.removeEventListener("abort", cancel)
	}
}

export function shareFiles(files: File[]): File[] {
	if (!navigator.share || !files.length) return []
	const first = files.slice(0, 1)
	try {
		return navigator.canShare?.({ files: first }) === true ? first : []
	} catch {
		return []
	}
}

export async function copyLink(url: string): Promise<"copied" | "manual"> {
	return publicLink(url) ? copyText(url) : "manual"
}

export async function copyText(text: string): Promise<"copied" | "manual"> {
	try {
		if (!text.trim() || !navigator.clipboard?.writeText) return "manual"
		await navigator.clipboard.writeText(text)
		return "copied"
	} catch {
		return "manual"
	}
}

export async function shareProduct(product: Product, files: File[]): Promise<"shared" | "cancelled" | "failed" | "copied" | "manual"> {
	if (!product.share_text.trim()) return "failed"
	if (!navigator.share) return copyText(product.share_text)
	const supported = shareFiles(files)
	const data: ShareData = { text: product.share_text }
	if (supported.length) data.files = supported
	try {
		await navigator.share(data)
		return "shared"
	} catch (error) {
		return (error as { name?: string })?.name === "AbortError" ? "cancelled" : "failed"
	}
}
