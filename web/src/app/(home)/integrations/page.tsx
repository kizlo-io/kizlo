import { Suspense } from "react"
import { IntegrationsCatalog } from "@/components/integrations-catalog"
import { client } from "@/lib/kizlo/server"
import { createMetadata } from "@/lib/metadata"

export const metadata = createMetadata({
	title: "Integrations",
	description: "Browse the integrations that connect Kizlo with the tools in your stack.",
	alternates: { canonical: "/integrations" },
})

export default async function IntegrationsPage() {
	const { data } = await client.integrations.list()
	const integrations = data ?? []

	return (
		<main className="flex flex-1 flex-col">
			<section className="border-fd-border border-b">
				<div className="mx-auto w-full max-w-6xl px-6 py-16">
					<h1 className="font-semibold text-4xl text-fd-foreground tracking-tight sm:text-5xl">Integrations</h1>
					<p className="mt-4 max-w-2xl text-fd-muted-foreground leading-relaxed sm:text-lg">
						Connect Kizlo with the tools in your stack. Each integration ships as an npm package, a WordPress plugin, or both.
					</p>
				</div>
			</section>

			<div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6">
				<Suspense>
					<IntegrationsCatalog integrations={integrations} />
				</Suspense>
			</div>
		</main>
	)
}
