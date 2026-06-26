import { buildPucMetadata, getLatestRelease, isPluginSlug } from "@/lib/plugins"

// Self-hosted update feed read by the Plugin Update Checker bundled in the WP
// plugins. The URL ends in `.json` (e.g. `/plugin/updates/kizlo.json`), so the
// dynamic segment carries the suffix — strip it to get the slug.
export async function GET(_request: Request, { params }: { params: Promise<{ plugin: string }> }) {
	const { plugin } = await params
	const slug = plugin.endsWith(".json") ? plugin.slice(0, -".json".length) : plugin

	if (!isPluginSlug(slug)) {
		return new Response("Unknown plugin", { status: 404 })
	}

	const release = await getLatestRelease(slug)
	if (!release) {
		return new Response("No release found", { status: 404 })
	}

	return Response.json(buildPucMetadata(slug, release))
}
