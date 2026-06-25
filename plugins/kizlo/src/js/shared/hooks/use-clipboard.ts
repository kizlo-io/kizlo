import { useState } from "react"

export function useClipboard(options?: { cb?: () => void; time?: number }) {
	const [copied, setCopied] = useState(false)

	const copy = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text)
			setCopied(true)
			options?.cb?.()
			setTimeout(() => setCopied(false), options?.time ?? 2000)
		} catch (err) {
			console.error("Failed to copy:", err)
			setCopied(false)
		}
	}

	return { copied, copy }
}
