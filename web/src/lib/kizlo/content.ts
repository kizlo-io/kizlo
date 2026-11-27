import type { WP_EndpointInput } from "kizlo"
import { deserializeSeo } from "kizlo"
import { client } from "./client"

export async function getContent(kind: "post" | "page", input: WP_EndpointInput<"kizlo.content.post.retrieve">) {
	const result = await client.kizlo.content[kind].retrieve(input)
	const entry = result.data
	return {
		...result,
		data: entry
			? {
					...entry,
					title: entry.title.rendered,
					content: entry.content.rendered,
					seo: entry.kizlo?.seo ? deserializeSeo(entry.kizlo.seo) : null,
				}
			: null,
	}
}
