import type { SeoSchema } from "kizlo"

export function JsonLd({ schema }: { schema: SeoSchema }) {
	return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
}
