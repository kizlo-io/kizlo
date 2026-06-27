import { metaSchema, pageSchema } from "fumadocs-core/source/schema"
import { defineConfig, defineDocs } from "fumadocs-mdx/config"
import { z } from "zod"

// You can customize Zod schemas for frontmatter and `meta.json` here
// see https://fumadocs.dev/docs/mdx/collections
export const docs = defineDocs({
	dir: "src/app/(docs)/content/docs",
	docs: {
		// `types` lets a reference page declare which TypeScript types it documents, so
		// AutoTypeTable cells for those types link to it. See web/src/components/mdx.tsx.
		schema: pageSchema.extend({ types: z.array(z.string()).optional() }),
		postprocess: {
			includeProcessedMarkdown: true,
		},
	},
	meta: {
		schema: metaSchema,
	},
})

export default defineConfig({
	mdxOptions: {
		// MDX options
	},
})
