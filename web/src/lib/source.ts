import * as PhosphorIcons from "@phosphor-icons/react/dist/ssr"
import { docs } from "collections/server"
import { loader } from "fumadocs-core/source"
import { type ComponentType, createElement } from "react"
import { brandIcons } from "@/components/icons"
import { docsContentRoute, docsImageRoute, docsRoute } from "./shared"

function resolveIcon(name: string | undefined) {
	if (!name) return
	if (name in brandIcons) return createElement(brandIcons[name as keyof typeof brandIcons])
	const Icon = (PhosphorIcons as unknown as Record<string, ComponentType>)[name]
	if (Icon) return createElement(Icon)
	console.warn(`[icons] unknown icon: ${name}`)
}

export const source = loader({
	baseUrl: docsRoute,
	source: docs.toFumadocsSource(),
	icon: resolveIcon,
})

export function getPageImage(page: (typeof source)["$inferPage"]) {
	const segments = [...page.slugs, "image.png"]

	return {
		segments,
		url: `${docsImageRoute}/${segments.join("/")}`,
	}
}

export function getPageMarkdownUrl(page: (typeof source)["$inferPage"]) {
	const segments = [...page.slugs, "content.md"]

	return {
		segments,
		url: `${docsContentRoute}/${segments.join("/")}`,
	}
}

export async function getLLMText(page: (typeof source)["$inferPage"]) {
	const processed = await page.data.getText("processed")

	return `# ${page.data.title} (${page.url})

${processed}`
}
