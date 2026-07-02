import { useState } from "react"

export function useClipboard(options?: { cb?: () => void; time?: number }) {
	const [copied, setCopied] = useState(false)

	const copy = async (text: string) => {
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(text)
			} else {
				fallbackCopy(text)
			}
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

function fallbackCopy(text: string) {
	const textarea = document.createElement("textarea")
	textarea.value = text
	textarea.style.position = "fixed"
	textarea.style.opacity = "0"
	document.body.appendChild(textarea)
	textarea.focus()
	textarea.select()

	try {
		const ok = document.execCommand("copy")
		if (!ok) throw new Error("execCommand copy failed")
	} finally {
		document.body.removeChild(textarea)
	}
}
