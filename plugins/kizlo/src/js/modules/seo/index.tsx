import { createRoot } from "@wordpress/element"
import { ComponentGallery } from "@/shared/components/ui/gallery"
import { Toaster } from "@/shared/components/ui/sonner"
import { MetaBox } from "./MetaBox"
import "./types"

const container = document.getElementById("kizlo-seo-root")

const isPreview = new URLSearchParams(window.location.search).get("kizlo_preview") === "1"

if (container && isPreview) {
	createRoot(container).render(<ComponentGallery />)
} else if (container && window.kizloSeo) {
	createRoot(container).render(
		<>
			<MetaBox
				meta={window.kizloSeo.meta}
				defaults={window.kizloSeo.defaults}
				variables={window.kizloSeo.variables}
				templates={window.kizloSeo.templates}
				context={window.kizloSeo.context}
				variant={window.kizloSeo.variant ?? "post"}
			/>
			<Toaster position="top-right" swipeDirections={["right"]} />
		</>,
	)
}
