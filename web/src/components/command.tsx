"use client"

import { Check, Copy } from "lucide-react"
import { useState } from "react"

export function Command({ command }: { command: string }) {
	const [copied, setCopied] = useState(false)

	function copy() {
		navigator.clipboard.writeText(command).then(() => {
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		})
	}

	return (
		<div className="flex items-center gap-3 rounded-lg border border-fd-border bg-fd-card py-2 pr-2 pl-4 font-mono text-sm">
			<span aria-hidden className="select-none text-fd-muted-foreground">
				$
			</span>
			<code className="text-fd-foreground">{command}</code>
			<button
				type="button"
				onClick={copy}
				aria-label={copied ? "Copied" : "Copy command"}
				className="ml-1 rounded-md p-1.5 text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
			>
				{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
			</button>
		</div>
	)
}
