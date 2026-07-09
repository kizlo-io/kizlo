import type { SeoSchema } from "kizlo"

// Inline the JSON-LD graph as a script tag. `<` is escaped so the serialized
// payload can never break out of the script element.
export function JsonLd({ schema }: { schema: SeoSchema }) {
	return (
		<script
			type="application/ld+json"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD must be inlined as raw script content
			dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }}
		/>
	)
}
