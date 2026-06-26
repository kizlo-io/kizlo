import { getLatestRelease, getPluginReleases, isPluginSlug } from "@/lib/plugins"

// Clean, brandable download URL that 302s to the GitHub Release zip. Used by
// docs (manual installs) and the PUC feed's `download_url`. `?version=x.y.z`
// pins a specific release; otherwise the latest is served.
export async function GET(request: Request, { params }: { params: Promise<{ plugin: string }> }) {
	const { plugin } = await params
	if (!isPluginSlug(plugin)) {
		return new Response("Unknown plugin", { status: 404 })
	}

	const version = new URL(request.url).searchParams.get("version")

	const release = version ? (await getPluginReleases(plugin)).find((r) => r.version === version) : await getLatestRelease(plugin)

	if (!release) {
		return new Response("No matching release found", { status: 404 })
	}

	return Response.redirect(release.zipUrl, 302)
}
