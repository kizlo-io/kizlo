import type { Metadata } from "next"
import Link from "next/link"
import { cache } from "react"
import { Command } from "@/components/command"
import { JsonLd } from "@/components/json-ld"
import { ShaderBackdrop } from "@/components/shader-backdrop"
import { client } from "@/lib/kizlo/server"
import { createMetadata } from "@/lib/metadata"
import { toMetadata } from "@/lib/seo"
import { appName, docsRoute, socials } from "@/lib/shared"

const getHomeSeo = cache(() => client.seo.homepage())

export async function generateMetadata(): Promise<Metadata> {
	const { data, error } = await getHomeSeo()

	if (error) return createMetadata({ alternates: { canonical: "/" } })

	console.log(data.head)

	return toMetadata(data.head)
}

export default async function HomePage() {
	const { data } = await getHomeSeo()

	return (
		<main className="relative flex max-h-dvh flex-1 flex-col items-center justify-center overflow-hidden px-6 py-24 text-center">
			{data && <JsonLd schema={data.schema} />}
			<ShaderBackdrop />

			<div className="relative mb-8">
				<div aria-hidden className="absolute -inset-5 rounded-full bg-fd-foreground/5 blur-2xl" />
				{/* biome-ignore lint/performance/noImgElement: remote SVG; next/image needs dangerouslyAllowSVG (XSS risk) */}
				<img src="https://cdn.kizlo.io/logo/icon-light.svg" alt={appName} className="relative hidden h-14 w-14 dark:block" />
				{/* biome-ignore lint/performance/noImgElement: remote SVG; next/image needs dangerouslyAllowSVG (XSS risk) */}
				<img src="https://cdn.kizlo.io/logo/icon-dark.svg" alt={appName} className="relative h-14 w-14 dark:hidden" />
			</div>

			<h1 className="max-w-2xl text-balance font-semibold text-4xl text-fd-foreground capitalize tracking-tight sm:text-5xl">
				The toolkit for headless WordPress
			</h1>

			<p className="mt-5 max-w-xl text-balance text-fd-muted-foreground leading-relaxed sm:text-lg">
				{appName} is built for a stack that you host and own from top to bottom. Use it to build websites, mobile apps, agentic
				applications, and more.
			</p>

			<div className="mt-6 flex flex-wrap items-center justify-center gap-3">
				<Command command="npx kizlo init" />

				<Link
					href={docsRoute}
					className="rounded-lg bg-fd-foreground px-5 py-2.5 font-medium text-fd-background text-sm transition-opacity hover:opacity-90"
				>
					<span className="hidden md:block">Documentation</span>
					<span className="md:hidden">Docs</span>
				</Link>
			</div>

			<ul className="mt-12 flex flex-wrap items-center justify-center gap-x-2 gap-y-3 text-fd-muted-foreground text-sm">
				{socials.map((social, index) => (
					<li key={social.label} className="flex items-center gap-2">
						{index > 0 && <span aria-hidden className="h-1 w-1 rounded-full bg-fd-border" />}
						<Link href={social.href} target="_blank" rel="noreferrer" className="font-medium transition-colors hover:text-fd-foreground">
							{social.label}
						</Link>
					</li>
				))}
			</ul>
		</main>
	)
}
