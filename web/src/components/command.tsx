"use client"

import { CheckIcon, CopyIcon } from "@phosphor-icons/react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"

export function Command({ command }: { command: string }) {
	const [status, setStatus] = useState<"idle" | "copied" | "error">("idle")
	const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(
		() => () => {
			if (timeout.current) clearTimeout(timeout.current)
		},
		[],
	)

	async function copy() {
		if (timeout.current) clearTimeout(timeout.current)
		try {
			await navigator.clipboard.writeText(command)
			setStatus("copied")
		} catch {
			setStatus("error")
		}
		timeout.current = setTimeout(() => setStatus("idle"), 2000)
	}

	return (
		<div className="relative flex max-w-full items-center gap-3 border border-border bg-card py-2 pr-2 pl-4 font-mono text-sm">
			<span aria-hidden="true" className="select-none text-muted-foreground">
				$
			</span>
			<code className="min-w-0 break-all text-foreground">{command}</code>
			<Button type="button" onClick={copy} variant="ghost" size="icon" aria-label={status === "copied" ? "Copied" : "Copy command"}>
				{status === "copied" ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
			</Button>
			<span role="status" className={status === "error" ? "absolute top-full left-0 mt-1 text-xs" : "sr-only"}>
				{status === "copied" ? "Command copied" : status === "error" ? "Could not copy. Select the command to copy it." : ""}
			</span>
		</div>
	)
}
