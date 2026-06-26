import defaultMdxComponents from "fumadocs-ui/mdx"
import type { MDXComponents } from "mdx/types"
import { DownloadButton } from "@/components/download-button"

export function getMDXComponents(components?: MDXComponents) {
	return {
		...defaultMdxComponents,
		DownloadButton,
		...components,
	} satisfies MDXComponents
}

export const useMDXComponents = getMDXComponents

declare global {
	type MDXProvidedComponents = ReturnType<typeof getMDXComponents>
}
