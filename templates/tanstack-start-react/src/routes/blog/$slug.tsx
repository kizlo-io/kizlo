import { createFileRoute, notFound } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { renderJsonLd, resolvePageHead } from "kizlo/tanstack-start"
import { client } from "@/lib/kizlo/server"

// Return only what the page renders (title, content, SEO) — a lean, serializable payload, not the whole
// WordPress post. JSON-LD is rendered to a string here so the loader payload stays serializable.
const getPost = createServerFn({ method: "GET" })
	.validator((slug: string) => slug)
	.handler(async ({ data: slug }) => {
		const { data } = await client.posts.get({ params: { identifier: slug } })
		if (!data) return null
		return {
			title: data.title,
			content: data.content,
			head: data.seo?.head ?? null,
			jsonLd: data.seo ? renderJsonLd(data.seo.schema) : null,
		}
	})

export const Route = createFileRoute("/blog/$slug")({
	loader: async ({ params }) => {
		const post = await getPost({ data: params.slug })
		if (!post) throw notFound()
		return post
	},
	// SEO tags and JSON-LD mapped from the post's SEO head. Missing/unpublished posts 404 in the loader.
	head: ({ loaderData }) => (loaderData?.head ? resolvePageHead(loaderData.head, loaderData.jsonLd) : {}),
	component: Post,
})

function Post() {
	const post = Route.useLoaderData()

	return (
		<article style={{ maxWidth: 720, margin: "0 auto", padding: "4rem 1.5rem" }}>
			<h1>{post.title ?? "Untitled"}</h1>
			<div dangerouslySetInnerHTML={{ __html: post.content ?? "" }} />
		</article>
	)
}
