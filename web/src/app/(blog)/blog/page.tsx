import { createMetadata } from "@/lib/metadata"

export const metadata = createMetadata({
	title: "Blog",
	description: "Updates, guides, and deep dives on building headless WordPress with Kizlo.",
	alternates: { canonical: "/blog" },
})

export default function BlogPage() {
	return (
		<div className="flex flex-1 flex-col justify-center text-center">
			<p>Coming soon.</p>
		</div>
	)
}
