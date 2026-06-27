import defaultMdxComponents from "fumadocs-ui/mdx"
import type { MDXComponents } from "mdx/types"
import { AutoTypeTable } from "@/components/auto-type-table"
import { CommonErrorsTable } from "@/components/common-errors-table"
import { DownloadButton } from "@/components/download-button"

export function getMDXComponents(components?: MDXComponents) {
	return {
		...defaultMdxComponents,
		DownloadButton,
		AutoTypeTable,
		CommonErrorsTable,
		...components,
	} satisfies MDXComponents
}

export const useMDXComponents = getMDXComponents

declare global {
	type MDXProvidedComponents = ReturnType<typeof getMDXComponents>
}
