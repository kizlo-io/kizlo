import Link from "next/link"
import { ShaderBackdrop } from "@/components/shader-backdrop"
import { createMetadata } from "@/lib/metadata"
import { docsRoute } from "@/lib/shared"

export const metadata = createMetadata({
	title: "Integrations",
	alternates: { canonical: "/integrations" },
})

export default async function IntegrationsPage() {
	return (
		<main className="relative flex max-h-dvh flex-1 flex-col items-center justify-center overflow-hidden px-6 py-24 text-center">
			<ShaderBackdrop />

			<span className="relative mb-6 rounded-full border border-fd-border px-3 py-1 font-medium text-fd-muted-foreground text-xs uppercase tracking-wide">
				Coming soon
			</span>

			<h1 className="max-w-2xl text-balance font-semibold text-4xl text-fd-foreground tracking-tight sm:text-5xl">Integrations</h1>

			<p className="mt-5 max-w-xl text-balance text-fd-muted-foreground leading-relaxed sm:text-lg">
				We're building first-class integrations to connect Kizlo with the tools in your stack. Check back soon.
			</p>

			<div className="mt-6">
				<Link
					href={docsRoute}
					className="rounded-lg bg-fd-foreground px-5 py-2.5 font-medium text-fd-background text-sm transition-opacity hover:opacity-90"
				>
					Documentation
				</Link>
			</div>
		</main>
	)
}
