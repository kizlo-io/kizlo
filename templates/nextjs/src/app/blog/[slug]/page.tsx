import { deserializeSeo } from "kizlo"
import { createPageMetadata, renderJsonLd } from "kizlo/nextjs/server"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { client } from "@/lib/kizlo/client"

type Props = { params: Promise<{ slug: string }> }

// SEO tags (title, canonical, Open Graph, Twitter) mapped straight from the post's SEO head, so
// you never hand-write meta tags. Missing/unpublished posts fall back to the layout metadata.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params
	const { data } = await client.kizlo.content.post.retrieve({ params: { identifier: slug } })
	return data?.kizlo?.seo ? createPageMetadata(deserializeSeo(data.kizlo.seo).head) : {}
}

export default async function PostPage({ params }: Props) {
	const { slug } = await params
	const { data } = await client.kizlo.content.post.retrieve({ params: { identifier: slug } })
	if (!data) notFound()

	// JSON-LD structured data (schema.org) from the post's SEO, rendered as a script tag — the
	// Metadata API can't carry arbitrary JSON-LD, so it lives here in the page instead.
	const jsonLd = data.kizlo?.seo ? renderJsonLd(deserializeSeo(data.kizlo.seo).schema) : null

	return (
		<article style={{ maxWidth: 720, margin: "0 auto", padding: "4rem 1.5rem" }}>
			{jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} /> : null}

			<h1>{data.title.rendered || "Untitled"}</h1>
			<div dangerouslySetInnerHTML={{ __html: data.content.rendered || "" }} />
		</article>
	)
}
