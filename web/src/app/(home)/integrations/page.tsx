import { createPageMetadata } from "kizlo/nextjs/server"
import type { Metadata } from "next"
import { cache, Suspense } from "react"
import { IntegrationsCatalog } from "@/components/integrations-catalog"
import { JsonLd } from "@/components/json-ld"
import { client } from "@/lib/kizlo/server"
import { createMetadata } from "@/lib/metadata"

/** The catalog copy below is hand-written, but its head and JSON-LD come from the WordPress page. */
const getCatalogPage = cache(() => client.pages.get({ params: { identifier: "integrations" } }))

export async function generateMetadata(): Promise<Metadata> {
	const { data } = await getCatalogPage()
	if (!data?.seo?.head)
		return createMetadata({
			title: "Integrations",
			description: "Browse the integrations that connect Kizlo with the tools in your stack.",
			alternates: { canonical: "/integrations" },
		})
	return createPageMetadata(data.seo.head)
}

export default async function IntegrationsPage() {
	const [{ data }, page] = await Promise.all([client.integrations.list(), getCatalogPage()])
	const integrations = data ?? []

	return (
		<main className="flex flex-1 flex-col">
			<JsonLd schema={page.data?.seo?.schema} />

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
