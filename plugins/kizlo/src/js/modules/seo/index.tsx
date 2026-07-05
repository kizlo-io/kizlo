import { createRoot } from "@wordpress/element"
import { ComponentGallery } from "@/shared/components/ui/gallery"
import { Toaster } from "@/shared/ui/sonner"
import { MetaBox } from "./MetaBox"
import "./types"

const container = document.getElementById("kizlo-seo-root")

// Sandbox switch: `?kizlo_preview=1` on a managed post type's editor renders the
// component gallery instead of the real meta box. This is the canonical WP-first
// preview context (no preflight, full wp-admin bleed). Remove in Phase E.
const isPreview = new URLSearchParams(window.location.search).get("kizlo_preview") === "1"

if (container && isPreview) {
	createRoot(container).render(<ComponentGallery />)
} else if (container && window.kizloSeo) {
	createRoot(container).render(
		<>
			<MetaBox meta={window.kizloSeo.meta} defaults={window.kizloSeo.defaults} variables={window.kizloSeo.variables} />
			<Toaster position="top-right" swipeDirections={["right"]} />
		</>,
	)
}
