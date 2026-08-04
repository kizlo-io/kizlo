import { createPageMetadata } from "kizlo/nextjs/server"
import type { Metadata } from "next"
import { Features } from "@/components/features"
import { Hero } from "@/components/hero"
import { HowItWorks } from "@/components/how-it-works"
import { JsonLd } from "@/components/json-ld"
import { client } from "@/lib/kizlo/server"

export async function generateMetadata(): Promise<Metadata> {
	const data = await client.seo.homepage.call()
	return createPageMetadata(data.head)
}

export default async function HomePage() {
	const seo = await client.seo.homepage.call()

	return (
		<main className="bg-black">
			<JsonLd schema={seo?.schema} />

			<Hero />

			<HowItWorks />

			<Features />
		</main>
	)
}
