import "@/components/home/home.css"
import { createPageMetadata } from "kizlo/nextjs/server"
import type { Metadata } from "next"
import { cache } from "react"
import { HomeFooter, HomeNavigation } from "@/components/home/navigation"
import { Capabilities, Introduction, Quickstarts, TypesStory, WorkflowStory } from "@/components/home/sections"
import { JsonLd } from "@/components/json-ld"
import { client } from "@/lib/kizlo/server"
import { createMetadata } from "@/lib/metadata"

const getHomeSeo = cache(() => client.seo.homepage())

export async function generateMetadata(): Promise<Metadata> {
	const { data, error } = await getHomeSeo()
	if (error) return createMetadata({ alternates: { canonical: "/" } })
	return createPageMetadata(data.head)
}

export default async function HomePage() {
	const { data } = await getHomeSeo()
	// Vercel preview builds use production React, but still need the visual briefs for review.
	const showBriefs = process.env.NODE_ENV === "development" || process.env.VERCEL_ENV === "preview"

	return (
		<div className="kizlo-home min-h-screen">
			<div className="mx-auto max-w-7xl border-border border-x">
				<HomeNavigation />
				<main>
					<JsonLd schema={data?.schema} />
					<Introduction showBriefs={showBriefs} />
					<TypesStory showBriefs={showBriefs} />
					<WorkflowStory showBriefs={showBriefs} />
					<Capabilities />
					<Quickstarts />
				</main>
				<HomeFooter />
			</div>
		</div>
	)
}
