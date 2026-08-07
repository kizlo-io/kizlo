import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { CopyCommand } from "./hero"
import { Container, Wrapper } from "./layout"

export function FinalCta() {
	return (
		<Container>
			<Wrapper border="top-bottom" className="px-6 py-20 text-center sm:px-10 sm:py-28" ticks>
				<p className="text-[#6ea8ff] text-xs uppercase tracking-widest">Content should not be a code change</p>
				<h2 className="mx-auto mt-5 max-w-3xl text-balance text-4xl tracking-tight sm:text-5xl">
					Give editors WordPress. Keep the frontend yours.
				</h2>
				<p className="mx-auto mt-6 max-w-2xl text-balance text-neutral-400 leading-relaxed sm:text-lg">
					Start fresh or connect Kizlo to an existing app. Your content, SEO, frontend, and infrastructure stay under your control.
				</p>

				<div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
					<Link
						href="/docs/installation"
						className="group flex items-center gap-2 bg-white px-6 py-3 font-medium text-black transition-colors hover:bg-neutral-200"
					>
						Read the quickstart
						<ArrowRightIcon className="transition-transform duration-200 group-hover:translate-x-0.5" />
					</Link>
					<CopyCommand />
				</div>
			</Wrapper>
		</Container>
	)
}
