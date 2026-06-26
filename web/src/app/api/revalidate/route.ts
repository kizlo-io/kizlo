import { revalidatePath, revalidateTag } from "next/cache"

// Generic on-demand cache busting. Authed with a Bearer `REVALIDATE_SECRET`,
// it purges whatever `tag` / `path` query params it's given (each repeatable),
// e.g. `/api/revalidate?tag=plugin-releases`. Used by the release workflow to
// refresh the plugin update feeds, but kept resource-agnostic so any caller
// with the secret can invalidate its own tags/paths. Inert (500) without the
// secret configured.
export async function POST(request: Request) {
	const secret = process.env.REVALIDATE_SECRET
	if (!secret) {
		return new Response("Revalidation not configured", { status: 500 })
	}

	if (request.headers.get("authorization") !== `Bearer ${secret}`) {
		return new Response("Unauthorized", { status: 401 })
	}

	const params = new URL(request.url).searchParams
	const tags = params.getAll("tag")
	const paths = params.getAll("path")

	if (tags.length === 0 && paths.length === 0) {
		return new Response("Provide at least one `tag` or `path`", { status: 400 })
	}

	for (const tag of tags) revalidateTag(tag, "max")
	for (const path of paths) revalidatePath(path)

	return Response.json({ revalidated: true, tags, paths })
}