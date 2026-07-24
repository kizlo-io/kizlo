import Link from "next/link"
import { client } from "@/lib/kizlo/server"

export default async function Home() {
	const { items } = await client.posts.list.call({ query: { perPage: 10 } })

	return (
		<main style={{ maxWidth: 640, margin: "0 auto", padding: "4rem 1.5rem" }}>
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
