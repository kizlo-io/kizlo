import { createPageMetadata } from "kizlo/nextjs/server"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { JsonLd } from "@/components/json-ld"
import { client } from "@/lib/kizlo/server"
import { createMetadata } from "@/lib/metadata"
import { parsePageProps } from "@/lib/shared"

export async function generateMetadata(props: PageProps<"/blog/[slug]">): Promise<Metadata> {
	const { data } = await client.posts.get(await parsePageProps(props))
	if (!data?.seo?.head) return createMetadata({ alternates: { canonical: "/" } })
	return createPageMetadata(data.seo.head)
}

export default async function PostPage(props: PageProps<"/blog/[slug]">) {
	const { data, error } = await client.posts.get(await parsePageProps(props))
	if (error) notFound()

	return (
		<main>
			<JsonLd schema={data.seo?.schema} />
			<div>{data.title}</div>
		</main>
	)
}
