"use client"

import { ArrowRightIcon, CheckIcon, CopyIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { useState } from "react"
import { Container, Wrapper } from "./layout"

const INSTALL_COMMAND = "npx kizlo@latest create"

export function Hero({ className, ...props }: React.ComponentProps<"section">) {
	return (
		<Container className="relative">
			<Wrapper className="px-6 pt-40 pb-24 text-center sm:px-8 sm:pb-20">
				<Link
					target="_blank"
					href="https://github.com/kizlo-io/kizlo"
					className="mx-auto flex w-max items-center gap-2 border border-neutral-700 px-3 py-1.5 text-neutral-300 text-xs transition-colors hover:border-neutral-500 hover:text-white"
				>
					<span className="relative flex size-1.5">
						<span className="absolute inline-flex size-full animate-ping rounded-full bg-[#0066ff] opacity-75" />
						<span className="relative inline-flex size-1.5 rounded-full bg-[#0066ff]" />
					</span>
					Open source · Apache 2.0
				</Link>

				<h1 className="mx-auto mt-8 max-w-4xl text-balance text-5xl leading-[1.05] tracking-tight sm:text-6xl">
					Never hard-code
					<br className="hidden sm:block" /> <span className="">your content and SEO again.</span>
				</h1>

				<p className="mx-auto mt-6 max-w-5xl text-balance text-base text-neutral-400 sm:text-lg">
					Manage content and rich SEO in WordPress, then build content-driven applications with the frontend framework you already use.
				</p>

				<div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
					<Link
						href="/docs/installation"
						className="group flex items-center gap-2 bg-white px-6 py-3 font-medium text-black transition-colors hover:bg-neutral-200"
					>
						Get Started
						<ArrowRightIcon className="transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
					</Link>

					<CopyCommand />
				</div>
			</Wrapper>
		</Container>
	)
}

function CopyCommand({ command = INSTALL_COMMAND }: { command?: string }) {
	const [copied, setCopied] = useState(false)

	async function copy() {
		try {
			await navigator.clipboard.writeText(command)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch {
			// Clipboard unavailable — no-op
		}
	}

	return (
		<button
			type="button"
			onClick={copy}
			className="group flex items-center gap-3 border border-neutral-700 px-4 py-3 font-mono text-neutral-300 text-sm transition-colors hover:border-neutral-500 hover:text-white"
		>
			<span className="select-none text-neutral-600">$</span>
			<span>{command}</span>
			<span className="text-neutral-500 transition-colors group-hover:text-white">
				{copied ? <CheckIcon className="text-[#0066ff]" /> : <CopyIcon />}
			</span>
		</button>
	)
}
