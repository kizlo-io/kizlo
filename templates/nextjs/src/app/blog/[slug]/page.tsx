import { createPageMetadata, renderJsonLd } from "kizlo/nextjs/server"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { client } from "@/lib/kizlo/server"

type Props = { params: Promise<{ slug: string }> }

// SEO tags (title, canonical, Open Graph, Twitter) mapped straight from the post's SEO head, so
// you never hand-write meta tags. Missing/unpublished posts fall back to the layout metadata.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params
	const { data } = await client.posts.get({ params: { identifier: slug } })
	return data?.seo ? createPageMetadata(data.seo.head) : {}
}

export default async function PostPage({ params }: Props) {
	const { slug } = await params
	const { data } = await client.posts.get({ params: { identifier: slug } })
	if (!data) notFound()

	// JSON-LD structured data (schema.org) from the post's SEO, rendered as a script tag — the
	// Metadata API can't carry arbitrary JSON-LD, so it lives here in the page instead.
	const jsonLd = data.seo ? renderJsonLd(data.seo.schema) : null

	return (
		<article style={{ maxWidth: 720, margin: "0 auto", padding: "4rem 1.5rem" }}>
			{jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} /> : null}

			<h1>{data.title ?? "Untitled"}</h1>
			<div dangerouslySetInnerHTML={{ __html: data.content ?? "" }} />
		</article>
	)
}
