import { createFileRoute, Link } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { renderJsonLd, resolvePageHead } from "kizlo/tanstack-start"
import { client } from "@/lib/kizlo/server"

// The server-to-server client runs only on the server, so the data fetch lives in a server function; the
// loader calls it on the server during SSR and over RPC on client navigation. Return only what the page
// needs — a lean, serializable payload (the SEO head plus a pre-rendered JSON-LD string), not the whole
// WordPress post.
const getHome = createServerFn({ method: "GET" }).handler(async () => {
	const [{ items }, seo] = await Promise.all([client.posts.list.call({ query: { perPage: 10 } }), client.seo.homepage.call()])
	return {
		posts: items.map((post) => ({ id: post.id, slug: post.slug, title: post.title })),
		head: seo.head,
		jsonLd: renderJsonLd(seo.schema),
	}
})

export const Route = createFileRoute("/")({
	loader: () => getHome(),
	// SEO tags (title, canonical, Open Graph, Twitter) and JSON-LD, mapped straight from the homepage's
	// SEO head — you never hand-write meta tags.
	head: ({ loaderData }) => (loaderData ? resolvePageHead(loaderData.head, loaderData.jsonLd) : {}),
	component: Home,
})

function Home() {
	const { posts } = Route.useLoaderData()

	return (
		<main style={{ maxWidth: 640, margin: "0 auto", padding: "4rem 1.5rem" }}>
			<h1>Kizlo + TanStack Start</h1>
			{posts.length === 0 ? (
				<p>
					No published posts yet. Add one in WordPress (run <code>npx kizlo dev</code> for a local stack), then refresh.
				</p>
			) : (
				<ul>
					{posts.map((post) => (
						<li key={post.id}>
							<Link to="/blog/$slug" params={{ slug: post.slug }}>
								{post.title ?? "Untitled"}
							</Link>
						</li>
					))}
				</ul>
			)}
		</main>
	)
}
