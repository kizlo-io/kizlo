import { createFileRoute, Link } from "@tanstack/solid-router"
import { deserializeSeo, requireData } from "kizlo"
import { renderJsonLd, resolvePageHead } from "kizlo/tanstack-start"
import { For, Show } from "solid-js"
import { client } from "@/lib/kizlo/client"

async function getHome() {
	const [postsResult, seoResult] = await Promise.all([
		client.kizlo.content.post.list({ query: { per_page: 10 } }),
		client.kizlo.seo.homepage.retrieve(),
	])
	const items = requireData(postsResult)
	const seo = deserializeSeo(requireData(seoResult))
	return {
		posts: items.map((post) => ({ id: post.id, slug: post.slug, title: post.title.rendered })),
		head: seo.head,
		jsonLd: renderJsonLd(seo.schema),
	}
}

export const Route = createFileRoute("/")({
	loader: () => getHome(),
	// SEO tags (title, canonical, Open Graph, Twitter) and JSON-LD, mapped straight from the homepage's
	// SEO head — you never hand-write meta tags.
	head: ({ loaderData }) => (loaderData ? resolvePageHead(loaderData.head, loaderData.jsonLd) : {}),
	component: Home,
})

function Home() {
	// In Solid, loader data is a signal — call it to read the current value.
	const data = Route.useLoaderData()

	return (
		<main style={{ "max-width": "640px", margin: "0 auto", padding: "4rem 1.5rem" }}>
			<h1>Kizlo + TanStack Start (Solid)</h1>
			<Show
				when={data().posts.length > 0}
				fallback={
					<p>
						No published posts yet. Add one in WordPress (run <code>npx kizlo dev</code> for a local stack), then refresh.
					</p>
				}
			>
				<ul>
					<For each={data().posts}>
						{(post) => (
							<li>
								<Link to="/blog/$slug" params={{ slug: post.slug }}>
									{post.title ?? "Untitled"}
								</Link>
							</li>
						)}
					</For>
				</ul>
			</Show>
		</main>
	)
}
