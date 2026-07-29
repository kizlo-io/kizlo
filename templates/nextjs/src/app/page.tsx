import { createPageMetadata, renderJsonLd } from "kizlo/nextjs/server"
import type { Metadata } from "next"
import Link from "next/link"
import { client } from "@/lib/kizlo/server"

export async function generateMetadata(): Promise<Metadata> {
	const { head } = await client.seo.homepage.call()
	return createPageMetadata(head)
}

export default async function Home() {
	const [{ items }, { schema }] = await Promise.all([client.posts.list.call({ query: { perPage: 10 } }), client.seo.homepage.call()])

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
							<Link href={`/blog/${post.slug}`}>{post.title ?? "Untitled"}</Link>
						</li>
					))}
				</ul>
			)}
		</main>
	)
}
