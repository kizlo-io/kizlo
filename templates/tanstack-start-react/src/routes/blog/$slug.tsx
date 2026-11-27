import { createFileRoute, notFound } from "@tanstack/react-router"
import { deserializeSeo } from "kizlo"
import { renderJsonLd, resolvePageHead } from "kizlo/tanstack-start"
import { client } from "@/lib/kizlo/client"

async function getPost(slug: string) {
	const { data } = await client.kizlo.content.post.retrieve({ params: { identifier: slug } })
	if (!data) return null
	return {
		title: data.title.rendered,
		content: data.content.rendered,
		head: data.kizlo?.seo ? deserializeSeo(data.kizlo.seo).head : null,
		jsonLd: data.kizlo?.seo ? renderJsonLd(deserializeSeo(data.kizlo.seo).schema) : null,
	}
}

export const Route = createFileRoute("/blog/$slug")({
	loader: async ({ params }) => {
		const post = await getPost(params.slug)
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
