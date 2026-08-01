import { createPageMetadata, parsePageProps } from "kizlo/nextjs/server"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { JsonLd } from "@/components/json-ld"
import { client } from "@/lib/kizlo/server"
import { createMetadata } from "@/lib/metadata"

export async function generateMetadata(props: PageProps<"/[slug]">): Promise<Metadata> {
	const { data } = await client.pages.get(await parsePageProps(props))
	if (!data?.seo?.head) return createMetadata({ alternates: { canonical: "/" } })
	return createPageMetadata(data.seo?.head)
}

export default async function Page(props: PageProps<"/[slug]">) {
	const { data, error } = await client.pages.get(await parsePageProps(props))
	if (error) notFound()

	return (
		<main>
			<JsonLd schema={data.seo?.schema} />
			<div>{data.title}</div>

			{JSON.stringify(data.meta, null, 2)}

			<div className="prose" dangerouslySetInnerHTML={{ __html: data.content ?? "" }}></div>
		</main>
	)
}
