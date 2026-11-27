import { deserializeSeo, requireData } from "kizlo"
import { createPageMetadata, renderJsonLd } from "kizlo/nextjs/server"
import type { Metadata } from "next"
import Link from "next/link"
import { client } from "@/lib/kizlo/client"

export async function generateMetadata(): Promise<Metadata> {
	const { head } = deserializeSeo(requireData(await client.kizlo.seo.homepage.retrieve()))
	return createPageMetadata(head)
}

export default async function Home() {
	const [postsResult, seoResult] = await Promise.all([
		client.kizlo.content.post.list({ query: { per_page: 10 } }),
		client.kizlo.seo.homepage.retrieve(),
	])
	const items = requireData(postsResult)
	const { schema } = deserializeSeo(requireData(seoResult))

	const jsonLd = renderJsonLd(schema)

	return (
		<main style={{ maxWidth: 640, margin: "0 auto", padding: "4rem 1.5rem" }}>
			{jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} /> : null}

			<h1>Kizlo + Next.js</h1>
			{items.length === 0 ? (
				<p>
					No published posts yet. Add one in WordPress (run <code>npx kizlo dev</code> for a local stack), then refresh.
				</p>
			) : (
				<ul>
					{items.map((post) => (
						<li key={post.id}>
							<Link href={`/blog/${post.slug}`}>{post.title.rendered || "Untitled"}</Link>
						</li>
					))}
				</ul>
			)}
		</main>
	)
}
