import { client } from "@/lib/kizlo/server"

export default async function PostPage(props: PageProps<"/post">) {
	const data = await client.posts.list.call()

	return (
		<main>
			<div>{JSON.stringify(data, null, 2)}</div>
		</main>
	)
}
